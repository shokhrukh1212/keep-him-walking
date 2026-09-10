-- P15: public, formula-driven sponsor pricing and a seven-day rolling window.
--
-- Inventory becomes date-keyed. `sponsor_slots.country_day_id` was `not null unique`,
-- but a country-day cannot exist for D+2..D+7: its country, city and pack are only
-- known once that day's vote closes. A slot is therefore opened for a date and bound
-- to its country-day at rollover, once the destination is real.
--
-- `reserve_sponsor_slot` (v1) stays as the rollback contract.

alter table public.sponsor_slots
  alter column country_day_id drop not null,
  add column journey_id uuid references public.journeys(id) on delete cascade,
  add column slot_date date;

-- Existing slots are all bound to a country-day; their identity is that day's date.
update public.sponsor_slots s
set journey_id = cd.journey_id,
    slot_date = (cd.starts_at at time zone 'UTC')::date
from public.country_days cd
where cd.id = s.country_day_id;

delete from public.sponsor_slots where journey_id is null or slot_date is null;

alter table public.sponsor_slots
  alter column journey_id set not null,
  alter column slot_date set not null;

create unique index sponsor_slots_journey_date_idx
  on public.sponsor_slots (journey_id, slot_date);

create table public.sponsor_pricing (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  day_date date not null,
  price_cents integer not null check (price_cents > 0),
  basis_uniques integer not null check (basis_uniques >= 0),
  founding boolean not null default false,
  opened_at timestamptz not null default now(),
  primary key (journey_id, day_date)
);

alter table public.sponsorships
  add column tier text not null default 'standard'
    check (tier in ('standard', 'premium')),
  -- How the immutable expected_price_cents snapshot was derived, plus any later
  -- drift the webhook noticed. Never used to re-price a purchase.
  add column price_basis jsonb;

-- The public formula from docs/plan/05-SPONSORS-AND-PRICING.md section 3.
create or replace function public.sponsor_price_cents(
  p_basis_uniques integer,
  p_floor_cents integer,
  p_cents_per_unique integer,
  p_cap_cents integer
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(
    p_floor_cents,
    least(p_cap_cents, greatest(0, p_basis_uniques) * greatest(0, p_cents_per_unique))
  );
$$;

-- Premium is a whole-dollar multiple so the published price never shows odd cents.
create or replace function public.sponsor_tier_price_cents(
  p_price_cents integer,
  p_tier text,
  p_premium_multiplier numeric
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_tier = 'premium'
      then greatest(100, round(p_price_cents * p_premium_multiplier / 100.0) * 100)::integer
    else p_price_cents
  end;
$$;

-- The date of the country-day that owns p_now, i.e. "today" on the rollover clock
-- rather than on the UTC calendar. A day beginning 16:00Z belongs to its start date.
create or replace function public.journey_slot_date(
  p_journey_id uuid,
  p_now timestamptz
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (cd.starts_at at time zone 'UTC')::date
  from public.country_days cd
  where cd.journey_id = p_journey_id
    and cd.starts_at <= p_now
  order by cd.starts_at desc
  limit 1;
$$;

-- Opens every unopened date inside the rolling window. At steady state only D+7 is
-- new; a day already open keeps the price it opened at, so early buyers keep theirs.
create or replace function public.open_sponsor_pricing_window(
  p_journey_id uuid,
  p_real_now timestamptz,
  p_floor_cents integer,
  p_cents_per_unique integer,
  p_founding_cents integer,
  p_cap_cents integer,
  p_window_days integer,
  p_currency char(3) default 'USD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_today date;
  v_founding_until date;
  v_basis integer;
  v_price integer;
  v_offset integer;
  v_date date;
  v_founding boolean;
  v_opened jsonb := '[]'::jsonb;
begin
  if p_window_days < 1 or p_window_days > 30 then
    raise exception 'invalid sponsor window' using errcode = '22023';
  end if;
  select * into v_journey from public.journeys where id = p_journey_id for update;
  if not found then return jsonb_build_object('state', 'unknown_journey', 'opened', 0); end if;

  v_today := public.journey_slot_date(p_journey_id, p_real_now);
  if v_today is null then return jsonb_build_object('state', 'no_days', 'opened', 0); end if;

  -- Days 1..window of the season are the pre-sold founding block.
  v_founding_until := (v_journey.starts_at at time zone 'UTC')::date + (p_window_days - 1);

  -- "Yesterday" is the most recent finalized day. Absent one, the floor applies.
  select o.unique_watchers into v_basis
  from public.day_outcomes o
  join public.country_days cd on cd.id = o.country_day_id
  where cd.journey_id = p_journey_id
  order by cd.starts_at desc
  limit 1;
  v_basis := coalesce(v_basis, 0);

  for v_offset in 1..p_window_days loop
    v_date := v_today + v_offset;
    v_founding := v_date <= v_founding_until;
    v_price := case
      when v_founding then p_founding_cents
      else public.sponsor_price_cents(v_basis, p_floor_cents, p_cents_per_unique, p_cap_cents)
    end;

    insert into public.sponsor_pricing (journey_id, day_date, price_cents, basis_uniques, founding, opened_at)
    values (p_journey_id, v_date, v_price, case when v_founding then 0 else v_basis end, v_founding, p_real_now)
    on conflict (journey_id, day_date) do nothing;

    if found then
      v_opened := v_opened || jsonb_build_object('date', v_date, 'priceCents', v_price, 'founding', v_founding);
    end if;

    -- The slot carries the price the date opened at, even if the formula moves later.
    insert into public.sponsor_slots (journey_id, slot_date, price_cents, currency, status, created_at, updated_at)
    select p_journey_id, v_date, sp.price_cents, upper(p_currency), 'available', p_real_now, p_real_now
    from public.sponsor_pricing sp
    where sp.journey_id = p_journey_id and sp.day_date = v_date
    on conflict (journey_id, slot_date) do nothing;
  end loop;

  return jsonb_build_object('state', 'ok', 'today', v_today, 'basisUniques', v_basis, 'opened', v_opened);
end;
$$;

-- Called once a destination is real, so the sold date gains its country-day.
create or replace function public.bind_sponsor_slot_day(
  p_country_day_id uuid,
  p_real_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.country_days%rowtype;
  v_slot_id uuid;
begin
  select * into v_day from public.country_days where id = p_country_day_id;
  if not found then return null; end if;

  update public.sponsor_slots
  set country_day_id = p_country_day_id,
      updated_at = p_real_now
  where journey_id = v_day.journey_id
    and slot_date = (v_day.starts_at at time zone 'UTC')::date
    and country_day_id is distinct from p_country_day_id
  returning id into v_slot_id;

  return v_slot_id;
end;
$$;

-- v1 plus the purchasable window, the tier, and the price snapshot's provenance.
create or replace function public.reserve_sponsor_slot_v2(
  p_slot_id uuid,
  p_sponsor_name text,
  p_sponsor_email text,
  p_tier text,
  p_test_mode boolean,
  p_now timestamptz,
  p_reservation_minutes integer,
  p_premium_multiplier numeric,
  p_window_days integer
)
returns public.sponsorships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.sponsor_slots%rowtype;
  v_sponsorship public.sponsorships%rowtype;
  v_today date;
  v_price integer;
begin
  if p_reservation_minutes < 5 or p_reservation_minutes > 120 then
    raise exception 'invalid reservation duration' using errcode = '22023';
  end if;
  if p_tier not in ('standard', 'premium') then
    raise exception 'invalid sponsor tier' using errcode = '22023';
  end if;
  if p_window_days < 1 or p_window_days > 30 then
    raise exception 'invalid sponsor window' using errcode = '22023';
  end if;

  select * into v_slot from public.sponsor_slots where id = p_slot_id for update;
  if not found then raise exception 'unknown sponsor slot' using errcode = 'P0002'; end if;

  -- Only D+1..D+window are ever for sale, whatever a client asks for.
  v_today := public.journey_slot_date(v_slot.journey_id, p_now);
  if v_today is null
    or v_slot.slot_date <= v_today
    or v_slot.slot_date > v_today + p_window_days then
    raise exception 'sponsor day is outside the purchasable window' using errcode = '22023';
  end if;

  if v_slot.status = 'reserved' and v_slot.reserved_until <= p_now then
    update public.sponsorships set status = 'cancelled', updated_at = p_now
    where id = v_slot.reserved_by and status in ('draft', 'checkout_pending');
    update public.sponsor_slots set status = 'available', reserved_by = null, reserved_until = null, updated_at = p_now
    where id = p_slot_id;
    v_slot.status := 'available';
  end if;
  if v_slot.status <> 'available' then
    raise exception 'sponsor slot is unavailable' using errcode = '23505';
  end if;

  v_price := public.sponsor_tier_price_cents(v_slot.price_cents, p_tier, p_premium_multiplier);

  insert into public.sponsorships (
    slot_id, status, sponsor_name, sponsor_email, expected_price_cents,
    expected_currency, test_mode, tier, price_basis, created_at, updated_at
  ) values (
    p_slot_id, 'checkout_pending', p_sponsor_name, p_sponsor_email, v_price,
    v_slot.currency, p_test_mode, p_tier,
    jsonb_build_object(
      'slotDate', v_slot.slot_date,
      'slotPriceCents', v_slot.price_cents,
      'tier', p_tier,
      'premiumMultiplier', p_premium_multiplier,
      'reservedAt', p_now
    ),
    p_now, p_now
  ) returning * into v_sponsorship;

  update public.sponsor_slots set
    status = 'reserved', reserved_by = v_sponsorship.id,
    reserved_until = p_now + make_interval(mins => p_reservation_minutes), updated_at = p_now
  where id = p_slot_id;
  return v_sponsorship;
end;
$$;

alter table public.sponsor_pricing enable row level security;

revoke all on public.sponsor_pricing from anon, authenticated;
revoke all on function public.sponsor_price_cents(integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.sponsor_tier_price_cents(integer, text, numeric) from public, anon, authenticated;
revoke all on function public.journey_slot_date(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.open_sponsor_pricing_window(uuid, timestamptz, integer, integer, integer, integer, integer, char) from public, anon, authenticated;
revoke all on function public.bind_sponsor_slot_day(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_sponsor_slot_v2(uuid, text, text, text, boolean, timestamptz, integer, numeric, integer) from public, anon, authenticated;

grant execute on function public.sponsor_price_cents(integer, integer, integer, integer) to service_role;
grant execute on function public.sponsor_tier_price_cents(integer, text, numeric) to service_role;
grant execute on function public.journey_slot_date(uuid, timestamptz) to service_role;
grant execute on function public.open_sponsor_pricing_window(uuid, timestamptz, integer, integer, integer, integer, integer, char) to service_role;
grant execute on function public.bind_sponsor_slot_day(uuid, timestamptz) to service_role;
grant execute on function public.reserve_sponsor_slot_v2(uuid, text, text, text, boolean, timestamptz, integer, numeric, integer) to service_role;
