-- Phase 2 sponsor inventory, payment ledger, review workflow, and first-party metrics.

create table public.sponsor_slots (
  id uuid primary key default gen_random_uuid(),
  country_day_id uuid not null unique references public.country_days(id) on delete cascade,
  price_cents integer not null check (price_cents > 0),
  currency char(3) not null default 'USD' check (currency = upper(currency)),
  status text not null check (status in ('available', 'reserved', 'sold', 'closed')),
  reserved_by uuid,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'reserved' and reserved_by is not null and reserved_until is not null)
    or status <> 'reserved'
  )
);

create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  slot_id uuid not null references public.sponsor_slots(id) on delete restrict,
  status text not null check (status in (
    'draft', 'checkout_pending', 'paid_pending_review', 'approved', 'scheduled',
    'live', 'completed', 'rejected', 'refunded', 'cancelled'
  )),
  sponsor_name text not null check (char_length(sponsor_name) between 2 and 100),
  sponsor_email text not null,
  disclosure text not null default 'Sponsored',
  cta_label text,
  cta_url text,
  private_creative_path text,
  public_creative_path text,
  lemon_checkout_id text unique,
  lemon_order_id text unique,
  expected_price_cents integer not null check (expected_price_cents > 0),
  expected_currency char(3) not null default 'USD',
  test_mode boolean not null,
  paid_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cta_url is null or cta_url ~ '^https://'),
  check (status not in ('approved', 'scheduled', 'live', 'completed') or approved_at is not null),
  check (status not in ('paid_pending_review', 'approved', 'scheduled', 'live', 'completed') or paid_at is not null)
);

create unique index sponsorships_one_active_per_slot_idx
  on public.sponsorships (slot_id)
  where status not in ('rejected', 'refunded', 'cancelled');

create or replace function public.enforce_sponsorship_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'refunded' then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('checkout_pending', 'cancelled'))
    or (old.status = 'checkout_pending' and new.status in ('paid_pending_review', 'cancelled'))
    or (old.status = 'paid_pending_review' and new.status in ('approved', 'rejected'))
    or (old.status = 'approved' and new.status in ('scheduled', 'rejected'))
    or (old.status = 'scheduled' and new.status in ('live', 'rejected', 'cancelled'))
    or (old.status = 'live' and new.status in ('completed', 'cancelled'))
    or (old.status = 'cancelled' and new.status = 'paid_pending_review')
  ) then
    raise exception 'illegal sponsorship transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger sponsorship_transition_guard
before update of status on public.sponsorships
for each row execute function public.enforce_sponsorship_transition();

alter table public.sponsor_slots
  add constraint sponsor_slots_reserved_by_fk
  foreign key (reserved_by) references public.sponsorships(id) deferrable initially deferred;

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemonsqueezy' check (provider = 'lemonsqueezy'),
  provider_event_id text not null,
  event_name text not null,
  payload_checksum text not null check (length(payload_checksum) = 64),
  sponsorship_id uuid references public.sponsorships(id) on delete set null,
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (provider, provider_event_id)
);

create table public.sponsor_metric_events (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete cascade,
  event_type text not null check (event_type in (
    'impression', 'engaged_view', 'watch_second', 'cta_click', 'postcard_created', 'postcard_shared', 'session'
  )),
  visitor_day_hash text check (visitor_day_hash is null or length(visitor_day_hash) = 64),
  dedupe_key text not null,
  quantity integer not null default 1 check (quantity > 0),
  occurred_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  unique (sponsorship_id, event_type, dedupe_key)
);

create index sponsor_metric_events_rollup_idx
  on public.sponsor_metric_events (sponsorship_id, occurred_at, event_type);

create table public.sponsor_daily_metrics (
  sponsorship_id uuid not null references public.sponsorships(id) on delete cascade,
  metric_date date not null,
  impressions bigint not null default 0,
  engaged_views bigint not null default 0,
  watch_seconds bigint not null default 0,
  cta_clicks bigint not null default 0,
  postcards_created bigint not null default 0,
  postcards_shared bigint not null default 0,
  sessions bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (sponsorship_id, metric_date)
);

create or replace function public.reserve_sponsor_slot(
  p_slot_id uuid,
  p_sponsor_name text,
  p_sponsor_email text,
  p_test_mode boolean,
  p_now timestamptz,
  p_reservation_minutes integer
)
returns public.sponsorships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.sponsor_slots%rowtype;
  v_sponsorship public.sponsorships%rowtype;
begin
  if p_reservation_minutes < 5 or p_reservation_minutes > 120 then
    raise exception 'invalid reservation duration' using errcode = '22023';
  end if;
  select * into v_slot from public.sponsor_slots where id = p_slot_id for update;
  if not found then raise exception 'unknown sponsor slot' using errcode = 'P0002'; end if;

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

  insert into public.sponsorships (
    slot_id, status, sponsor_name, sponsor_email, expected_price_cents,
    expected_currency, test_mode, created_at, updated_at
  ) values (
    p_slot_id, 'checkout_pending', p_sponsor_name, p_sponsor_email,
    v_slot.price_cents, v_slot.currency, p_test_mode, p_now, p_now
  ) returning * into v_sponsorship;

  update public.sponsor_slots set
    status = 'reserved', reserved_by = v_sponsorship.id,
    reserved_until = p_now + make_interval(mins => p_reservation_minutes), updated_at = p_now
  where id = p_slot_id;
  return v_sponsorship;
end;
$$;

create or replace function public.aggregate_sponsor_metrics(
  p_metric_date date,
  p_now timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows bigint;
begin
  insert into public.sponsor_daily_metrics (
    sponsorship_id, metric_date, impressions, engaged_views, watch_seconds,
    cta_clicks, postcards_created, postcards_shared, sessions, updated_at
  )
  select
    sponsorship_id, p_metric_date,
    coalesce(sum(quantity) filter (where event_type = 'impression'), 0),
    coalesce(sum(quantity) filter (where event_type = 'engaged_view'), 0),
    coalesce(sum(quantity) filter (where event_type = 'watch_second'), 0),
    coalesce(sum(quantity) filter (where event_type = 'cta_click'), 0),
    coalesce(sum(quantity) filter (where event_type = 'postcard_created'), 0),
    coalesce(sum(quantity) filter (where event_type = 'postcard_shared'), 0),
    coalesce(sum(quantity) filter (where event_type = 'session'), 0),
    p_now
  from public.sponsor_metric_events
  where occurred_at >= p_metric_date::timestamptz
    and occurred_at < (p_metric_date + 1)::timestamptz
  group by sponsorship_id
  on conflict (sponsorship_id, metric_date) do update set
    impressions = excluded.impressions,
    engaged_views = excluded.engaged_views,
    watch_seconds = excluded.watch_seconds,
    cta_clicks = excluded.cta_clicks,
    postcards_created = excluded.postcards_created,
    postcards_shared = excluded.postcards_shared,
    sessions = excluded.sessions,
    updated_at = excluded.updated_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

alter table public.sponsor_slots enable row level security;
alter table public.sponsorships enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.sponsor_metric_events enable row level security;
alter table public.sponsor_daily_metrics enable row level security;

revoke all on public.sponsor_slots, public.sponsorships, public.payment_webhook_events,
  public.sponsor_metric_events, public.sponsor_daily_metrics from anon, authenticated;
revoke all on function public.reserve_sponsor_slot(uuid, text, text, boolean, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.aggregate_sponsor_metrics(date, timestamptz) from public, anon, authenticated;
revoke all on function public.enforce_sponsorship_transition() from public, anon, authenticated;
grant execute on function public.reserve_sponsor_slot(uuid, text, text, boolean, timestamptz, integer) to service_role;
grant execute on function public.aggregate_sponsor_metrics(date, timestamptz) to service_role;
