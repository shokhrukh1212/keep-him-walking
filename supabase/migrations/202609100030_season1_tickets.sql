-- P22: Ticket purchases and authoritative future-day country locks.

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  sponsorship_id uuid not null unique references public.sponsorships(id) on delete restrict,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  slot_id uuid not null references public.sponsor_slots(id) on delete restrict,
  target_day_number integer not null check (target_day_number > 0),
  target_date date not null,
  pack_id text not null check (length(trim(pack_id)) > 0),
  country_code char(2) not null,
  country_name text not null check (length(trim(country_name)) > 0),
  city_name text not null check (length(trim(city_name)) > 0),
  time_zone text not null check (length(trim(time_zone)) > 0),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'refunded', 'cancelled')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tickets_one_active_slot_idx on public.tickets (slot_id)
  where status not in ('rejected', 'refunded', 'cancelled');
create unique index tickets_one_active_day_idx on public.tickets (journey_id, target_day_number)
  where status not in ('rejected', 'refunded', 'cancelled');

alter table public.tickets enable row level security;
revoke all on public.tickets from anon, authenticated;

alter table public.country_days
  add column arrival_mode text not null default 'walk'
    check (arrival_mode in ('walk', 'flight')),
  add column ticket_id uuid unique references public.tickets(id) on delete restrict;

create or replace function public.reserve_ticket(
  p_slot_id uuid,
  p_pack_id text,
  p_country_code text,
  p_country_name text,
  p_city_name text,
  p_time_zone text,
  p_lat double precision,
  p_lon double precision,
  p_sponsor_name text,
  p_sponsor_email text,
  p_test_mode boolean,
  p_now timestamptz,
  p_reservation_minutes integer,
  p_horizon_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.sponsor_slots%rowtype;
  v_journey public.journeys%rowtype;
  v_sponsorship public.sponsorships%rowtype;
  v_ticket public.tickets%rowtype;
  v_story_now timestamptz;
  v_current_day integer;
  v_target_day integer;
  v_price integer;
begin
  if p_reservation_minutes < 5 or p_reservation_minutes > 120
    or p_horizon_days < 3 or p_horizon_days > 30
    or p_country_code !~ '^[A-Z]{2}$'
    or coalesce(length(trim(p_pack_id)), 0) = 0 then
    raise exception 'invalid ticket reservation' using errcode = '22023';
  end if;

  select * into v_slot from public.sponsor_slots ss where ss.id = p_slot_id for update;
  if not found then raise exception 'unknown sponsor slot' using errcode = 'P0002'; end if;
  select * into v_journey from public.journeys j where j.id = v_slot.journey_id for update;
  if not found then raise exception 'unknown journey' using errcode = 'P0002'; end if;
  v_story_now := public.journey_story_now(v_journey.id, p_now);

  select cd.day_number into v_current_day
  from public.country_days cd
  where cd.journey_id = v_journey.id and cd.starts_at <= v_story_now and cd.ends_at > v_story_now
  order by cd.day_number desc limit 1;
  if v_current_day is null or v_current_day < 8 then
    raise exception 'tickets open on day 8' using errcode = '22023';
  end if;
  v_target_day := (v_slot.slot_date - (v_journey.starts_at at time zone 'UTC')::date) + 1;
  if v_target_day < v_current_day + 3 or v_target_day > v_current_day + p_horizon_days then
    raise exception 'ticket day is outside the sale window' using errcode = '22023';
  end if;

  if v_slot.status = 'reserved' and v_slot.reserved_until <= p_now then
    update public.sponsorships s set status = 'cancelled', updated_at = p_now
    where s.id = v_slot.reserved_by and s.status in ('draft', 'checkout_pending');
    update public.tickets t set status = 'cancelled', updated_at = p_now
    where t.sponsorship_id = v_slot.reserved_by and t.status = 'pending_review';
    update public.sponsor_slots ss set status = 'available', reserved_by = null,
      reserved_until = null, updated_at = p_now where ss.id = p_slot_id;
    v_slot.status := 'available';
  end if;
  if v_slot.status <> 'available' then
    raise exception 'sponsor slot is unavailable' using errcode = '23505';
  end if;

  v_price := greatest(24900, v_slot.price_cents * 3);
  insert into public.sponsorships (
    slot_id, status, sponsor_name, sponsor_email, expected_price_cents,
    expected_currency, test_mode, tier, price_basis, created_at, updated_at
  ) values (
    p_slot_id, 'checkout_pending', p_sponsor_name, p_sponsor_email, v_price,
    v_slot.currency, p_test_mode, 'standard',
    jsonb_build_object('product', 'ticket', 'slotDate', v_slot.slot_date,
      'standardDayPriceCents', v_slot.price_cents, 'formula', 'max(24900,3*P(day))'),
    p_now, p_now
  ) returning * into v_sponsorship;

  insert into public.tickets (
    sponsorship_id, journey_id, slot_id, target_day_number, target_date,
    pack_id, country_code, country_name, city_name, time_zone, lat, lon,
    created_at, updated_at
  ) values (
    v_sponsorship.id, v_journey.id, p_slot_id, v_target_day, v_slot.slot_date,
    p_pack_id, p_country_code, p_country_name, p_city_name, p_time_zone, p_lat, p_lon,
    p_now, p_now
  ) returning * into v_ticket;

  update public.sponsor_slots ss set status = 'reserved', reserved_by = v_sponsorship.id,
    reserved_until = p_now + make_interval(mins => p_reservation_minutes), updated_at = p_now
  where ss.id = p_slot_id;
  return jsonb_build_object(
    'ticket_public_id', v_ticket.public_id,
    'sponsorship_id', v_sponsorship.id,
    'sponsorship_public_id', v_sponsorship.public_id,
    'expected_price_cents', v_price,
    'target_day_number', v_target_day
  );
end;
$$;

create or replace function public.cancel_ticket_reservation(
  p_sponsorship_id uuid,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ticket public.tickets%rowtype;
begin
  select * into v_ticket from public.tickets t where t.sponsorship_id = p_sponsorship_id for update;
  if not found or v_ticket.status <> 'pending_review' then return false; end if;
  update public.sponsorships s set status = 'cancelled', updated_at = p_now
    where s.id = p_sponsorship_id and s.status = 'checkout_pending';
  update public.tickets t set status = 'cancelled', updated_at = p_now where t.id = v_ticket.id;
  update public.sponsor_slots ss set status = 'available', reserved_by = null,
    reserved_until = null, updated_at = p_now where ss.id = v_ticket.slot_id;
  return true;
end;
$$;

create or replace function public.mark_ticket_refunded(
  p_sponsorship_id uuid,
  p_now timestamptz,
  p_creative_rejected boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ticket public.tickets%rowtype;
begin
  select * into v_ticket from public.tickets t where t.sponsorship_id = p_sponsorship_id for update;
  if not found then return false; end if;
  if v_ticket.status in ('rejected', 'refunded', 'cancelled') then return false; end if;
  update public.tickets t set status = case when p_creative_rejected then 'rejected' else 'refunded' end,
    updated_at = p_now where t.id = v_ticket.id;
  update public.sponsor_slots ss set status = 'available', reserved_by = null,
    reserved_until = null, updated_at = p_now where ss.id = v_ticket.slot_id;
  return true;
end;
$$;

create or replace function public.approve_ticket(
  p_sponsorship_id uuid,
  p_public_creative_path text,
  p_now timestamptz,
  p_cutoff_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_sponsorship public.sponsorships%rowtype;
  v_journey public.journeys%rowtype;
  v_target_start timestamptz;
  v_day public.country_days%rowtype;
begin
  if p_cutoff_hours < 1 or p_cutoff_hours > 72 or coalesce(length(trim(p_public_creative_path)), 0) = 0 then
    raise exception 'invalid ticket approval' using errcode = '22023';
  end if;
  select * into v_ticket from public.tickets t where t.sponsorship_id = p_sponsorship_id for update;
  if not found then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  select * into v_journey from public.journeys j where j.id = v_ticket.journey_id for update;
  select * into v_sponsorship from public.sponsorships s where s.id = p_sponsorship_id for update;
  if v_ticket.status <> 'pending_review' or v_sponsorship.status <> 'paid_pending_review'
    or v_sponsorship.private_creative_path is null then
    raise exception 'ticket is not ready for approval' using errcode = '22023';
  end if;
  v_target_start := v_journey.starts_at + make_interval(days => v_ticket.target_day_number - 1);
  if public.journey_story_now(v_journey.id, p_now) > v_target_start - make_interval(hours => p_cutoff_hours) then
    raise exception 'ticket approval cutoff passed' using errcode = '22023';
  end if;

  update public.sponsorships s set status = 'approved', reviewed_at = p_now,
    approved_at = p_now, public_creative_path = p_public_creative_path, updated_at = p_now
  where s.id = p_sponsorship_id;
  update public.tickets t set status = 'approved', approved_at = p_now, updated_at = p_now
  where t.id = v_ticket.id;

  select * into v_day from public.country_days cd
    where cd.journey_id = v_ticket.journey_id and cd.day_number = v_ticket.target_day_number for update;
  if found then
    if v_day.status not in ('scheduled') then
      raise exception 'ticket day is no longer editable' using errcode = '22023';
    end if;
    update public.country_days cd set country_code = v_ticket.country_code,
      country_name = v_ticket.country_name, city_name = v_ticket.city_name,
      time_zone = v_ticket.time_zone, scene_pack_id = v_ticket.pack_id,
      story_summary = 'Ticket destination', arrival_mode = 'flight',
      ticket_id = v_ticket.id, updated_at = p_now where cd.id = v_day.id;
  end if;
  return jsonb_build_object('state', 'approved', 'ticketId', v_ticket.id,
    'dayNumber', v_ticket.target_day_number, 'packId', v_ticket.pack_id);
end;
$$;

-- The caller proposes content, but the journey lock makes an approved Ticket the
-- final authority. It also suppresses the ballot whose result that Ticket replaces.
create or replace function public.create_next_country_day(
  p_real_now timestamptz,
  p_day jsonb,
  p_vote jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_ticket public.tickets%rowtype;
  v_day_number integer := (p_day ->> 'dayNumber')::integer;
  v_day_id uuid;
  v_vote_id uuid;
  v_existing uuid;
  v_option jsonb;
  v_order integer := 0;
  v_write_vote jsonb := p_vote;
begin
  select * into v_journey from public.journeys j
  where j.phase2_enabled and j.status in ('preview', 'active')
  order by j.starts_at desc limit 1 for update;
  if not found then return jsonb_build_object('state', 'inactive'); end if;
  select cd.id into v_existing from public.country_days cd
    where cd.journey_id = v_journey.id and cd.day_number = v_day_number;
  if v_existing is not null then return jsonb_build_object('state', 'exists', 'countryDayId', v_existing); end if;

  select * into v_ticket from public.tickets t
    where t.journey_id = v_journey.id and t.target_day_number = v_day_number and t.status = 'approved'
    for update;
  if found then
    p_day := p_day || jsonb_build_object(
      'countryCode', trim(v_ticket.country_code), 'countryName', v_ticket.country_name,
      'cityName', v_ticket.city_name, 'timeZone', v_ticket.time_zone,
      'scenePackId', v_ticket.pack_id, 'storySummary', 'Ticket destination',
      'arrivalMode', 'flight', 'ticketId', v_ticket.id
    );
  end if;
  if exists (select 1 from public.tickets t where t.journey_id = v_journey.id
    and t.target_day_number = v_day_number + 1 and t.status = 'approved') then
    v_write_vote := null;
  end if;

  insert into public.country_days (
    journey_id, day_number, country_code, country_name, city_name, time_zone,
    starts_at, ends_at, scene_pack_id, status, story_summary, arrival_mode, ticket_id,
    created_at, updated_at
  ) values (
    v_journey.id, v_day_number, p_day ->> 'countryCode', p_day ->> 'countryName',
    p_day ->> 'cityName', p_day ->> 'timeZone', (p_day ->> 'startsAt')::timestamptz,
    (p_day ->> 'endsAt')::timestamptz, p_day ->> 'scenePackId', 'scheduled',
    p_day ->> 'storySummary', coalesce(p_day ->> 'arrivalMode', 'walk'),
    nullif(p_day ->> 'ticketId', '')::uuid, p_real_now, p_real_now
  ) returning id into v_day_id;
  if v_write_vote is null or v_write_vote = 'null'::jsonb then
    return jsonb_build_object('state', 'created', 'countryDayId', v_day_id,
      'voteId', null, 'ticketId', v_ticket.id);
  end if;
  insert into public.votes (country_day_id, question, opens_at, closes_at,
    result_publishes_at, status, kind, created_at, updated_at)
  values (v_day_id, v_write_vote ->> 'question', (v_write_vote ->> 'opensAt')::timestamptz,
    (v_write_vote ->> 'closesAt')::timestamptz, (v_write_vote ->> 'closesAt')::timestamptz,
    'open', coalesce(v_write_vote ->> 'kind', 'destination'), p_real_now, p_real_now)
  returning id into v_vote_id;
  for v_option in select value from jsonb_array_elements(v_write_vote -> 'options') loop
    insert into public.vote_options (vote_id, label, payload_json, display_order, pack_id)
    values (v_vote_id, v_option ->> 'label', coalesce(v_option -> 'payload', '{}'::jsonb),
      v_order, v_option ->> 'packId');
    v_order := v_order + 1;
  end loop;
  return jsonb_build_object('state', 'created', 'countryDayId', v_day_id,
    'voteId', v_vote_id, 'ticketId', v_ticket.id);
end;
$$;

revoke all on function public.reserve_ticket(uuid,text,text,text,text,text,double precision,double precision,text,text,boolean,timestamptz,integer,integer) from public, anon, authenticated;
revoke all on function public.cancel_ticket_reservation(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.mark_ticket_refunded(uuid,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.approve_ticket(uuid,text,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.create_next_country_day(timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_ticket(uuid,text,text,text,text,text,double precision,double precision,text,text,boolean,timestamptz,integer,integer) to service_role;
grant execute on function public.cancel_ticket_reservation(uuid,timestamptz) to service_role;
grant execute on function public.mark_ticket_refunded(uuid,timestamptz,boolean) to service_role;
grant execute on function public.approve_ticket(uuid,text,timestamptz,integer) to service_role;
grant execute on function public.create_next_country_day(timestamptz,jsonb,jsonb) to service_role;
