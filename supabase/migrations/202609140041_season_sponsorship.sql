-- Prompt 2, part 2: one exclusive sponsor per seven-day season at a fixed USD 499.00.
--
-- The daily sponsor tables, receipts, refunds and webhook ledger stay as they are,
-- so any transaction made under them can still be serviced. A season booking has
-- its own order: material is submitted and reviewed first, payment is requested
-- only after approval, and the database - never a disabled button - admits one
-- holder per season. Contact details stay in this private table; only the approved
-- product name, description, website and logo are published.

create table public.season_sponsorships (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete restrict,
  status text not null check (status in (
    'submitted', 'approved', 'payment_pending', 'scheduled', 'active', 'completed',
    'rejected', 'expired', 'cancelled', 'refund_required', 'refunded'
  )),
  product_name text not null check (char_length(product_name) between 2 and 60 and product_name = btrim(product_name)),
  website_url text not null check (
    char_length(website_url) <= 300
    and website_url ~ '^https://[^/?#@[:space:]]+\.[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  description text not null check (char_length(description) between 10 and 140 and description = btrim(description)),
  contact_name text not null check (char_length(contact_name) between 2 and 100),
  contact_email text not null check (
    char_length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  private_logo_path text not null check (char_length(private_logo_path) between 1 and 300),
  public_logo_path text check (public_logo_path is null or char_length(public_logo_path) between 1 and 300),
  rights_confirmed_at timestamptz not null,
  price_cents integer not null default 49900 check (price_cents = 49900),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  provider text check (provider is null or provider in ('dodo', 'fixture')),
  test_mode boolean not null default false,
  provider_checkout_id text check (provider_checkout_id is null or char_length(provider_checkout_id) between 1 and 120),
  provider_payment_id text check (provider_payment_id is null or char_length(provider_payment_id) between 1 and 120),
  hold_expires_at timestamptz,
  -- An internal reason code, never visitor text.
  status_reason text check (status_reason is null or status_reason ~ '^[a-z_]{1,60}$'),
  submitted_at timestamptz not null,
  approved_at timestamptz,
  decided_at timestamptz,
  paid_at timestamptz,
  delivered_from timestamptz,
  delivered_until timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'payment_pending' or (hold_expires_at is not null and provider is not null)),
  check (status not in ('approved', 'payment_pending', 'scheduled', 'active', 'completed')
    or (approved_at is not null and public_logo_path is not null)),
  check (status not in ('scheduled', 'active', 'completed', 'refund_required')
    or (paid_at is not null and provider_payment_id is not null)),
  check (status not in ('active', 'completed') or delivered_from is not null),
  check (status <> 'refunded' or refunded_at is not null)
);

-- The one-sponsor limit: at most one checkout hold or paid booking per season.
create unique index season_sponsorships_one_holder_idx
  on public.season_sponsorships (journey_id)
  where status in ('payment_pending', 'scheduled', 'active', 'completed');
create unique index season_sponsorships_checkout_idx
  on public.season_sponsorships (provider, provider_checkout_id)
  where provider_checkout_id is not null;
create unique index season_sponsorships_payment_idx
  on public.season_sponsorships (provider, provider_payment_id)
  where provider_payment_id is not null;
create index season_sponsorships_status_idx
  on public.season_sponsorships (status, journey_id);

-- Every payment the provider reports, keyed by its own id, so a duplicate or
-- out-of-order event resolves to the outcome already recorded.
create table public.season_sponsor_payments (
  provider text not null check (provider in ('dodo', 'fixture')),
  payment_id text not null check (char_length(payment_id) between 1 and 120),
  season_sponsorship_id uuid references public.season_sponsorships(id) on delete restrict,
  checkout_id text check (checkout_id is null or char_length(checkout_id) between 1 and 120),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  tax_cents integer check (tax_cents is null or tax_cents >= 0),
  currency char(3),
  test_mode boolean,
  outcome text not null check (outcome in ('scheduled', 'refund_required', 'refund_requested', 'refunded', 'unmatched')),
  reason text check (reason is null or reason ~ '^[a-z_]{1,60}$'),
  dispute_state text check (dispute_state is null or dispute_state in ('opened', 'won', 'lost')),
  received_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (provider, payment_id)
);

-- First-party views and clicks, one of each per visitor per season day at most.
create table public.season_sponsor_metric_events (
  season_sponsorship_id uuid not null references public.season_sponsorships(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'cta_click')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  occurred_at timestamptz not null,
  primary key (season_sponsorship_id, event_type, dedupe_key)
);

-- The provider ledger now also carries season events; its Lemon Squeezy rows are unchanged.
alter table public.payment_webhook_events
  drop constraint payment_webhook_events_provider_check;
alter table public.payment_webhook_events
  add constraint payment_webhook_events_provider_check
  check (provider in ('lemonsqueezy', 'dodo', 'fixture'));
alter table public.payment_webhook_events
  add column season_sponsorship_id uuid references public.season_sponsorships(id) on delete set null;

create or replace function public.enforce_season_sponsorship_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'submitted' and new.status in ('approved', 'rejected', 'cancelled', 'expired'))
    or (old.status = 'approved' and new.status in ('payment_pending', 'scheduled', 'rejected', 'cancelled', 'expired', 'refund_required'))
    or (old.status = 'payment_pending' and new.status in ('approved', 'scheduled', 'cancelled', 'expired', 'refund_required'))
    or (old.status = 'scheduled' and new.status in ('active', 'completed', 'refund_required', 'refunded'))
    or (old.status = 'active' and new.status in ('completed', 'cancelled', 'refund_required', 'refunded'))
    or (old.status = 'completed' and new.status in ('refund_required', 'refunded'))
    or (old.status in ('rejected', 'expired', 'cancelled') and new.status in ('refund_required', 'refunded'))
    or (old.status = 'refund_required' and new.status = 'refunded')
  ) then
    raise exception 'illegal season sponsorship transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger season_sponsorship_transition_guard
before update of status on public.season_sponsorships
for each row execute function public.enforce_season_sponsorship_transition();

-- A genuine request for a future season. It reserves nothing and takes no money.
create or replace function public.submit_season_sponsorship(
  p_journey_id uuid,
  p_product_name text,
  p_website_url text,
  p_description text,
  p_contact_name text,
  p_contact_email text,
  p_private_logo_path text,
  p_rights_confirmed boolean,
  p_now timestamptz,
  p_cutoff_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.journeys%rowtype;
  v_id uuid;
  v_public_id uuid;
begin
  if p_cutoff_hours < 24 or p_cutoff_hours > 720 then
    raise exception 'invalid sale cutoff' using errcode = '22023';
  end if;
  if p_rights_confirmed is distinct from true then
    raise exception 'rights to the supplied material must be confirmed' using errcode = '22023';
  end if;
  select * into v_season from public.journeys j where j.id = p_journey_id for share;
  if not found or v_season.ends_at is null or not v_season.phase2_enabled
    or v_season.status not in ('draft', 'preview', 'active')
    or v_season.starts_at - make_interval(hours => p_cutoff_hours) <= p_now then
    raise exception 'season is not open for sponsorship' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = p_journey_id and s.status in ('scheduled', 'active', 'completed')
  ) then
    raise exception 'season is already sponsored' using errcode = '55000';
  end if;
  insert into public.season_sponsorships (
    journey_id, status, product_name, website_url, description, contact_name,
    contact_email, private_logo_path, rights_confirmed_at, submitted_at, created_at, updated_at
  ) values (
    p_journey_id, 'submitted', btrim(p_product_name), btrim(p_website_url), btrim(p_description),
    btrim(p_contact_name), lower(btrim(p_contact_email)), p_private_logo_path, p_now, p_now, p_now, p_now
  ) returning id, public_id into v_id, v_public_id;
  return jsonb_build_object('state', 'submitted', 'id', v_id, 'publicId', v_public_id, 'journeyId', p_journey_id);
end;
$$;

-- The operational content check. Approval is not evidence that a payment provider
-- accepts this business; it only clears the material for a paid request.
create or replace function public.review_season_sponsorship(
  p_id uuid,
  p_decision text,
  p_public_logo_path text,
  p_now timestamptz,
  p_cutoff_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.season_sponsorships%rowtype;
  v_starts_at timestamptz;
begin
  if p_decision not in ('approved', 'rejected') or p_cutoff_hours < 24 or p_cutoff_hours > 720 then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;
  select * into v_booking from public.season_sponsorships s where s.id = p_id for update;
  if not found then
    raise exception 'unknown season sponsorship' using errcode = 'P0002';
  end if;
  if p_decision = 'rejected' then
    if v_booking.status not in ('submitted', 'approved') then
      raise exception 'only unpaid material can be rejected' using errcode = '55000';
    end if;
    update public.season_sponsorships s
    set status = 'rejected', status_reason = 'material_rejected', decided_at = p_now, updated_at = p_now
    where s.id = p_id;
    return jsonb_build_object('state', 'rejected', 'id', p_id);
  end if;
  if v_booking.status <> 'submitted' then
    raise exception 'only submitted material can be approved' using errcode = '55000';
  end if;
  if nullif(btrim(p_public_logo_path), '') is null then
    raise exception 'approved material needs its public logo copy' using errcode = '22023';
  end if;
  select j.starts_at into v_starts_at from public.journeys j where j.id = v_booking.journey_id;
  if v_starts_at - make_interval(hours => p_cutoff_hours) <= p_now then
    raise exception 'season is not open for sponsorship' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = v_booking.journey_id and s.status in ('scheduled', 'active', 'completed')
  ) then
    raise exception 'season is already sponsored' using errcode = '55000';
  end if;
  update public.season_sponsorships s
  set status = 'approved', approved_at = p_now, decided_at = p_now,
      public_logo_path = btrim(p_public_logo_path), status_reason = null, updated_at = p_now
  where s.id = p_id;
  return jsonb_build_object('state', 'approved', 'id', p_id);
end;
$$;

-- Reserves the season for one approved sponsor's checkout, atomically and for a
-- bounded time. Holds on one season queue on its journey row. Another sponsor's
-- lapsed hold is released only after its grace period, which covers delayed
-- payment events; the minute reconciler also asks the provider first.
create or replace function public.hold_season_sponsorship(
  p_public_id uuid,
  p_provider text,
  p_test_mode boolean,
  p_hold_minutes integer,
  p_grace_minutes integer,
  p_cutoff_hours integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.season_sponsorships%rowtype;
  v_starts_at timestamptz;
  v_holder public.season_sponsorships%rowtype;
  v_until timestamptz;
begin
  if p_provider not in ('dodo', 'fixture')
    or p_hold_minutes < 10 or p_hold_minutes > 120
    or p_grace_minutes < 5 or p_grace_minutes > 1440
    or p_cutoff_hours < 24 or p_cutoff_hours > 720 then
    raise exception 'invalid season hold' using errcode = '22023';
  end if;
  select * into v_booking from public.season_sponsorships s where s.public_id = p_public_id;
  if not found then
    raise exception 'unknown season sponsorship' using errcode = 'P0002';
  end if;
  select j.starts_at into v_starts_at from public.journeys j where j.id = v_booking.journey_id for update;
  select * into v_booking from public.season_sponsorships s where s.id = v_booking.id for update;

  if v_booking.status in ('scheduled', 'active', 'completed') then
    return jsonb_build_object('state', 'paid', 'id', v_booking.id);
  end if;
  if v_booking.status not in ('approved', 'payment_pending') then
    return jsonb_build_object('state', 'not_approved', 'id', v_booking.id, 'status', v_booking.status);
  end if;
  if v_starts_at - make_interval(hours => p_cutoff_hours) <= p_now then
    return jsonb_build_object('state', 'closed', 'id', v_booking.id);
  end if;

  select * into v_holder
  from public.season_sponsorships s
  where s.journey_id = v_booking.journey_id
    and s.id <> v_booking.id
    and s.status in ('payment_pending', 'scheduled', 'active', 'completed')
  for update;
  if found then
    if v_holder.status <> 'payment_pending'
      or v_holder.hold_expires_at + make_interval(mins => p_grace_minutes) > p_now then
      return jsonb_build_object('state', 'unavailable', 'id', v_booking.id);
    end if;
    update public.season_sponsorships s
    set status = 'approved', hold_expires_at = null, status_reason = 'hold_expired', updated_at = p_now
    where s.id = v_holder.id;
  end if;

  v_until := p_now + make_interval(mins => p_hold_minutes);
  update public.season_sponsorships s
  set status = 'payment_pending', provider = p_provider, test_mode = p_test_mode,
      hold_expires_at = v_until, status_reason = null, updated_at = p_now
  where s.id = v_booking.id;
  return jsonb_build_object('state', 'held', 'id', v_booking.id, 'holdExpiresAt', v_until);
end;
$$;

create or replace function public.attach_season_checkout(
  p_id uuid,
  p_checkout_id text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.season_sponsorships s
  set provider_checkout_id = p_checkout_id, updated_at = p_now
  where s.id = p_id and s.status = 'payment_pending';
  return found;
end;
$$;

-- Ends a hold that produced no payment: back to approved while the season can still
-- be sold, expired once booking has closed.
create or replace function public.release_season_hold(
  p_id uuid,
  p_reason text,
  p_cutoff_hours integer,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_starts_at timestamptz;
begin
  if p_reason !~ '^[a-z_]{1,60}$' or p_cutoff_hours < 24 or p_cutoff_hours > 720 then
    raise exception 'invalid hold release' using errcode = '22023';
  end if;
  select s.status, j.starts_at into v_status, v_starts_at
  from public.season_sponsorships s
  join public.journeys j on j.id = s.journey_id
  where s.id = p_id
  for update of s;
  if not found then
    raise exception 'unknown season sponsorship' using errcode = 'P0002';
  end if;
  if v_status <> 'payment_pending' then
    return v_status;
  end if;
  update public.season_sponsorships s
  set status = case
        when v_starts_at - make_interval(hours => p_cutoff_hours) <= p_now then 'expired'
        else 'approved'
      end,
      hold_expires_at = null, status_reason = p_reason, updated_at = p_now
  where s.id = p_id
  returning s.status into v_status;
  return v_status;
end;
$$;

-- Applies one provider-verified payment. The caller has already verified the
-- signature and read the payment back from the provider; this re-checks the amount,
-- currency, product and mode against the booking, then either schedules the one
-- booking the season admits or records a refund the operator must see through.
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
    -- Money that has arrived wins over a checkout that has not paid: another
    -- sponsor's unpaid hold is released rather than selling the week twice.
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

  -- A booking that paid but can no longer be delivered carries the refund itself.
  if v_reason in ('booking_not_payable', 'season_started', 'season_unavailable')
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

-- A refund confirmed by the provider. It may arrive before the payment event; the
-- ledger row then already says refunded when that payment is read.
create or replace function public.record_season_refund(
  p_provider text,
  p_payment_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
begin
  if p_provider not in ('dodo', 'fixture') or nullif(btrim(p_payment_id), '') is null then
    raise exception 'invalid season refund' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('season-payment:' || p_provider || ':' || p_payment_id));
  insert into public.season_sponsor_payments (provider, payment_id, outcome, received_at, updated_at)
  values (p_provider, p_payment_id, 'refunded', p_now, p_now)
  on conflict (provider, payment_id) do update
  set outcome = 'refunded', updated_at = excluded.updated_at;

  update public.season_sponsorships s
  set status = 'refunded', refunded_at = p_now,
      delivered_until = case when s.status = 'active' then p_now else s.delivered_until end,
      status_reason = coalesce(s.status_reason, 'refunded'), updated_at = p_now
  where s.provider = p_provider and s.provider_payment_id = p_payment_id and s.status <> 'refunded'
  returning s.id into v_booking_id;
  return jsonb_build_object('bookingId', v_booking_id, 'status', case when v_booking_id is null then 'no_booking' else 'refunded' end);
end;
$$;

create or replace function public.mark_season_refund_requested(
  p_provider text,
  p_payment_id text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.season_sponsor_payments p
  set outcome = 'refund_requested', updated_at = p_now
  where p.provider = p_provider and p.payment_id = p_payment_id and p.outcome = 'refund_required';
  return found;
end;
$$;

-- A lost dispute returns the money to the sponsor, so its placement ends as if refunded.
create or replace function public.record_season_dispute(
  p_provider text,
  p_payment_id text,
  p_state text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
begin
  if p_provider not in ('dodo', 'fixture') or p_state not in ('opened', 'won', 'lost')
    or nullif(btrim(p_payment_id), '') is null then
    raise exception 'invalid season dispute' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('season-payment:' || p_provider || ':' || p_payment_id));
  insert into public.season_sponsor_payments (provider, payment_id, outcome, dispute_state, received_at, updated_at)
  values (p_provider, p_payment_id, 'unmatched', p_state, p_now, p_now)
  on conflict (provider, payment_id) do update
  set dispute_state = excluded.dispute_state, updated_at = excluded.updated_at;
  if p_state = 'lost' then
    update public.season_sponsorships s
    set status = 'refunded', refunded_at = p_now, status_reason = 'dispute_lost',
        delivered_until = case when s.status = 'active' then p_now else s.delivered_until end,
        updated_at = p_now
    where s.provider = p_provider and s.provider_payment_id = p_payment_id and s.status <> 'refunded'
    returning s.id into v_booking_id;
  end if;
  return jsonb_build_object('bookingId', v_booking_id, 'disputeState', p_state);
end;
$$;

-- The operator's few manual actions, each only from the states it makes sense in.
create or replace function public.admin_season_sponsorship_action(
  p_id uuid,
  p_action text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.season_sponsorships%rowtype;
begin
  select * into v_booking from public.season_sponsorships s where s.id = p_id for update;
  if not found then
    raise exception 'unknown season sponsorship' using errcode = 'P0002';
  end if;
  if p_action = 'cancel' and v_booking.status in ('submitted', 'approved', 'payment_pending') then
    update public.season_sponsorships s
    set status = 'cancelled', hold_expires_at = null, status_reason = 'cancelled_by_operator', updated_at = p_now
    where s.id = p_id;
  elsif p_action = 'remove' and v_booking.status = 'active' then
    update public.season_sponsorships s
    set status = 'cancelled', delivered_until = p_now, status_reason = 'removed_by_operator', updated_at = p_now
    where s.id = p_id;
  elsif p_action = 'require_refund' and v_booking.status in ('scheduled', 'active', 'completed') then
    update public.season_sponsorships s
    set status = 'refund_required',
        delivered_until = case when v_booking.status = 'active' then p_now else s.delivered_until end,
        status_reason = 'refund_by_operator', updated_at = p_now
    where s.id = p_id;
    update public.season_sponsor_payments p
    set outcome = 'refund_required', updated_at = p_now
    where p.provider = v_booking.provider and p.payment_id = v_booking.provider_payment_id
      and p.outcome = 'scheduled';
  elsif p_action = 'mark_refunded' and v_booking.status = 'refund_required' then
    update public.season_sponsorships s
    set status = 'refunded', refunded_at = p_now, updated_at = p_now
    where s.id = p_id;
    update public.season_sponsor_payments p
    set outcome = 'refunded', updated_at = p_now
    where p.provider = v_booking.provider and p.payment_id = v_booking.provider_payment_id;
  else
    raise exception 'action % is not allowed from %', p_action, v_booking.status using errcode = '55000';
  end if;
  return jsonb_build_object('id', p_id, 'action', p_action);
end;
$$;

-- Time-based and idempotent: a paid booking is live exactly while its season is,
-- keeps the interval it was delivered, and requests that can no longer be sold expire.
create or replace function public.reconcile_season_sponsorships(
  p_real_now timestamptz,
  p_cutoff_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_activated integer;
  v_completed integer;
  v_expired integer;
begin
  if p_cutoff_hours < 24 or p_cutoff_hours > 720 then
    raise exception 'invalid sale cutoff' using errcode = '22023';
  end if;
  update public.season_sponsorships s
  set status = 'active', delivered_from = j.starts_at, updated_at = p_real_now
  from public.journeys j
  where j.id = s.journey_id and s.status = 'scheduled'
    and j.starts_at <= p_real_now and j.ends_at > p_real_now;
  get diagnostics v_activated = row_count;

  update public.season_sponsorships s
  set status = 'completed',
      delivered_from = coalesce(s.delivered_from, j.starts_at),
      delivered_until = coalesce(s.delivered_until, j.ends_at),
      updated_at = p_real_now
  from public.journeys j
  where j.id = s.journey_id and s.status in ('scheduled', 'active') and j.ends_at <= p_real_now;
  get diagnostics v_completed = row_count;

  update public.season_sponsorships s
  set status = 'expired', status_reason = 'sale_closed', updated_at = p_real_now
  from public.journeys j
  where j.id = s.journey_id and s.status in ('submitted', 'approved')
    and j.starts_at - make_interval(hours => p_cutoff_hours) <= p_real_now;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('activated', v_activated, 'completed', v_completed, 'expired', v_expired);
end;
$$;

alter table public.season_sponsorships enable row level security;
alter table public.season_sponsor_payments enable row level security;
alter table public.season_sponsor_metric_events enable row level security;
revoke all on public.season_sponsorships, public.season_sponsor_payments,
  public.season_sponsor_metric_events from anon, authenticated;

revoke all on function public.enforce_season_sponsorship_transition() from public, anon, authenticated;
revoke all on function public.submit_season_sponsorship(uuid, text, text, text, text, text, text, boolean, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.review_season_sponsorship(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.hold_season_sponsorship(uuid, text, boolean, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.attach_season_checkout(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_season_hold(uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_season_payment(text, text, uuid, text, integer, integer, text, boolean, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.record_season_refund(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_season_refund_requested(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_season_dispute(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_season_sponsorship_action(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_season_sponsorships(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.submit_season_sponsorship(uuid, text, text, text, text, text, text, boolean, timestamptz, integer) to service_role;
grant execute on function public.review_season_sponsorship(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.hold_season_sponsorship(uuid, text, boolean, integer, integer, integer, timestamptz) to service_role;
grant execute on function public.attach_season_checkout(uuid, text, timestamptz) to service_role;
grant execute on function public.release_season_hold(uuid, text, integer, timestamptz) to service_role;
grant execute on function public.confirm_season_payment(text, text, uuid, text, integer, integer, text, boolean, boolean, boolean, timestamptz) to service_role;
grant execute on function public.record_season_refund(text, text, timestamptz) to service_role;
grant execute on function public.mark_season_refund_requested(text, text, timestamptz) to service_role;
grant execute on function public.record_season_dispute(text, text, text, timestamptz) to service_role;
grant execute on function public.admin_season_sponsorship_action(uuid, text, timestamptz) to service_role;
grant execute on function public.reconcile_season_sponsorships(timestamptz, integer) to service_role;
