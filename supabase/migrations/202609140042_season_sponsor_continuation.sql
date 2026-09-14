-- Prompt 2 follow-up: preserve each request's agreed season dates and configured price.
--
-- Migration 0041 launched Season 1 at USD 499.00. This additive migration keeps that
-- price on existing requests, configures the agreed Season 2 and 3 prices, and makes
-- every new request snapshot its server-owned price and dates. Checkout refuses a
-- request whose season dates have changed since submission.

create table public.season_sponsor_prices (
  season_number integer primary key check (season_number > 0),
  price_cents integer not null check (price_cents > 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  configured_at timestamptz not null default now()
);

insert into public.season_sponsor_prices (season_number, price_cents)
values (1, 49900), (2, 59900), (3, 69900);

alter table public.season_sponsor_prices enable row level security;
revoke all on table public.season_sponsor_prices from anon, authenticated;
grant select on table public.season_sponsor_prices to service_role;

alter table public.season_sponsorships
  add column quoted_starts_at timestamptz,
  add column quoted_ends_at timestamptz;

update public.season_sponsorships s
set quoted_starts_at = j.starts_at,
    quoted_ends_at = j.ends_at
from public.journeys j
where j.id = s.journey_id;

alter table public.season_sponsorships
  alter column quoted_starts_at set not null,
  alter column quoted_ends_at set not null,
  add constraint season_sponsorships_quoted_dates_check
    check (quoted_ends_at = quoted_starts_at + interval '168 hours'),
  drop constraint season_sponsorships_price_cents_check,
  add constraint season_sponsorships_price_cents_check check (price_cents > 0);

create or replace function public.set_season_sponsorship_quote()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_season_number integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_price_cents integer;
  v_currency char(3);
begin
  select j.season_number, j.starts_at, j.ends_at
  into v_season_number, v_starts_at, v_ends_at
  from public.journeys j
  where j.id = new.journey_id;

  select p.price_cents, p.currency
  into v_price_cents, v_currency
  from public.season_sponsor_prices p
  where p.season_number = v_season_number;

  if v_price_cents is null then
    raise exception 'season sponsor price is not configured' using errcode = '55000';
  end if;

  new.price_cents := v_price_cents;
  new.currency := v_currency;
  new.quoted_starts_at := v_starts_at;
  new.quoted_ends_at := v_ends_at;
  return new;
end;
$$;

create trigger season_sponsorship_quote_on_insert
before insert on public.season_sponsorships
for each row execute function public.set_season_sponsorship_quote();

revoke all on function public.set_season_sponsorship_quote() from public, anon, authenticated;

create or replace function public.enforce_season_sponsorship_checkout_quote()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_price_cents integer;
begin
  if new.status <> 'payment_pending' or old.status = 'payment_pending' then
    return new;
  end if;

  select j.starts_at, j.ends_at
  into v_starts_at, v_ends_at
  from public.journeys j
  where j.id = new.journey_id;

  select p.price_cents into v_price_cents
  from public.journeys j
  join public.season_sponsor_prices p on p.season_number = j.season_number
  where j.id = new.journey_id;

  if v_starts_at is distinct from new.quoted_starts_at
    or v_ends_at is distinct from new.quoted_ends_at then
    raise exception 'season schedule changed' using errcode = '55000';
  end if;
  if v_price_cents is null or v_price_cents <> new.price_cents then
    raise exception 'season quote changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger season_sponsorship_checkout_quote_guard
before update of status on public.season_sponsorships
for each row execute function public.enforce_season_sponsorship_checkout_quote();

revoke all on function public.enforce_season_sponsorship_checkout_quote() from public, anon, authenticated;

-- A payment can settle after checkout was created. Recheck the saved dates inside
-- the same locked, idempotent transaction that schedules or refunds the payment.
create or replace function public.confirm_season_payment(
  p_provider text,
  p_payment_id text,
  p_booking_id uuid,
  p_checkout_id text,
  p_amount_cents integer,
  p_tax_cents integer,
  p_currency text,
  p_test_mode boolean,
  p_product_matches boolean,
  p_tax_inclusive boolean,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.season_sponsor_payments%rowtype;
  v_booking public.season_sponsorships%rowtype;
  v_season public.journeys%rowtype;
  v_reason text;
  v_net integer;
begin
  if p_provider not in ('dodo', 'fixture') or nullif(btrim(p_payment_id), '') is null then
    raise exception 'invalid season payment' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('season-payment:' || p_provider || ':' || p_payment_id));
  select * into v_existing
  from public.season_sponsor_payments p
  where p.provider = p_provider and p.payment_id = p_payment_id
  for update;
  if found then
    return jsonb_build_object(
      'outcome', v_existing.outcome, 'duplicate', true,
      'bookingId', v_existing.season_sponsorship_id, 'reason', v_existing.reason
    );
  end if;

  select * into v_booking from public.season_sponsorships s where s.id = p_booking_id;
  if not found then
    insert into public.season_sponsor_payments (
      provider, payment_id, checkout_id, amount_cents, tax_cents, currency, test_mode,
      outcome, reason, received_at, updated_at
    ) values (
      p_provider, p_payment_id, nullif(p_checkout_id, ''), p_amount_cents, p_tax_cents,
      upper(p_currency), p_test_mode, 'refund_required', 'unknown_booking', p_now, p_now
    );
    return jsonb_build_object('outcome', 'refund_required', 'duplicate', false, 'bookingId', null, 'reason', 'unknown_booking');
  end if;
  select * into v_season from public.journeys j where j.id = v_booking.journey_id for update;
  select * into v_booking from public.season_sponsorships s where s.id = p_booking_id for update;

  v_net := case when p_tax_inclusive then p_amount_cents else p_amount_cents - coalesce(p_tax_cents, 0) end;
  v_reason := case
    when p_product_matches is distinct from true then 'product_mismatch'
    when upper(coalesce(p_currency, '')) <> v_booking.currency
      or v_net is distinct from v_booking.price_cents then 'amount_mismatch'
    when p_test_mode is distinct from v_booking.test_mode then 'mode_mismatch'
    when v_booking.status in ('scheduled', 'active', 'completed') then 'duplicate_payment'
    when v_booking.status not in ('approved', 'payment_pending', 'expired')
      or v_booking.approved_at is null then 'booking_not_payable'
    when v_season.starts_at is distinct from v_booking.quoted_starts_at
      or v_season.ends_at is distinct from v_booking.quoted_ends_at then 'schedule_changed'
    when v_season.starts_at <= p_now
      or v_season.status not in ('draft', 'preview', 'active') then 'season_started'
    when exists (
      select 1 from public.season_sponsorships s
      where s.journey_id = v_booking.journey_id and s.id <> v_booking.id
        and s.status in ('scheduled', 'active', 'completed')
    ) then 'season_unavailable'
    else null
  end;

  if v_reason is null then
    update public.season_sponsorships s
    set status = 'approved', hold_expires_at = null, status_reason = 'season_sold', updated_at = p_now
    where s.journey_id = v_booking.journey_id and s.id <> v_booking.id and s.status = 'payment_pending';
    update public.season_sponsorships s
    set status = 'scheduled', provider = p_provider, provider_payment_id = p_payment_id,
        provider_checkout_id = coalesce(nullif(p_checkout_id, ''), s.provider_checkout_id),
        paid_at = p_now, status_reason = null, updated_at = p_now
    where s.id = v_booking.id;
    insert into public.season_sponsor_payments (
      provider, payment_id, season_sponsorship_id, checkout_id, amount_cents, tax_cents,
      currency, test_mode, outcome, reason, received_at, updated_at
    ) values (
      p_provider, p_payment_id, v_booking.id, nullif(p_checkout_id, ''), p_amount_cents,
      p_tax_cents, upper(p_currency), p_test_mode, 'scheduled', null, p_now, p_now
    );
    return jsonb_build_object('outcome', 'scheduled', 'duplicate', false, 'bookingId', v_booking.id, 'reason', null);
  end if;

  if v_reason in ('booking_not_payable', 'schedule_changed', 'season_started', 'season_unavailable')
    and v_booking.provider_payment_id is null
    and v_booking.status in ('approved', 'payment_pending', 'expired', 'rejected', 'cancelled') then
    update public.season_sponsorships s
    set status = 'refund_required', provider = p_provider, provider_payment_id = p_payment_id,
        paid_at = p_now, hold_expires_at = null, status_reason = v_reason, updated_at = p_now
    where s.id = v_booking.id;
  end if;
  insert into public.season_sponsor_payments (
    provider, payment_id, season_sponsorship_id, checkout_id, amount_cents, tax_cents,
    currency, test_mode, outcome, reason, received_at, updated_at
  ) values (
    p_provider, p_payment_id, v_booking.id, nullif(p_checkout_id, ''), p_amount_cents,
    p_tax_cents, upper(p_currency), p_test_mode, 'refund_required', v_reason, p_now, p_now
  );
  return jsonb_build_object('outcome', 'refund_required', 'duplicate', false, 'bookingId', v_booking.id, 'reason', v_reason);
end;
$$;
