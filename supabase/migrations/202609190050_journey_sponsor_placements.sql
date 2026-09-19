-- Paris relaunch sponsor inventory: ten fixed regular slots and one featured slot.
-- This is separate from historical daily/season sponsorship tables so no old promise,
-- receipt or webhook is rewritten by the new fixed-placement product.

create table public.journey_sponsor_slots (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete restrict,
  tier text not null check (tier in ('regular', 'featured')),
  position smallint not null,
  price_cents integer not null,
  currency char(3) not null default 'USD' check (currency = 'USD'),
  state text not null default 'available' check (state in ('available', 'held', 'occupied', 'closed')),
  reserved_order_id uuid,
  occupied_order_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (journey_id, tier, position),
  check ((tier = 'regular' and position between 1 and 10 and price_cents = 5000)
    or (tier = 'featured' and position = 1 and price_cents = 10000)),
  check ((state = 'available' and reserved_order_id is null and occupied_order_id is null)
    or (state = 'held' and reserved_order_id is not null and occupied_order_id is null)
    or (state = 'occupied' and occupied_order_id is not null and reserved_order_id is null)
    or state = 'closed')
);
create index journey_sponsor_slots_journey_idx on public.journey_sponsor_slots (journey_id, tier, position);

create table public.journey_sponsor_orders (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete restrict,
  slot_id uuid not null references public.journey_sponsor_slots(id) on delete restrict,
  buyer_hash text not null check (length(buyer_hash) = 64),
  tier text not null check (tier in ('regular', 'featured')),
  status text not null check (status in (
    'reserved', 'payment_pending', 'paid_pending_publish', 'active', 'pending_review',
    'removed', 'expired', 'cancelled', 'refund_required', 'refund_requested',
    'refunded', 'chargeback'
  )),
  product_url text not null check (
    char_length(product_url) <= 500
    and product_url ~ '^https://[^/?#@[:space:]]+\.[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
  ),
  product_name text not null check (
    char_length(product_name) between 1 and 32 and product_name = btrim(product_name)
  ),
  description text not null check (
    char_length(description) between 1 and 160 and description = btrim(description)
  ),
  private_logo_path text not null check (char_length(private_logo_path) between 1 and 400),
  public_logo_path text check (public_logo_path is null or char_length(public_logo_path) between 1 and 400),
  logo_fit text not null check (logo_fit in ('crop', 'contain')),
  rights_confirmed_at timestamptz not null,
  expected_price_cents integer not null check (expected_price_cents in (5000, 10000)),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  provider text not null check (provider in ('dodo', 'fixture')),
  provider_product_id text not null check (char_length(provider_product_id) between 1 and 160),
  provider_checkout_id text,
  provider_payment_id text,
  test_mode boolean not null,
  reservation_expires_at timestamptz not null,
  customer_email text check (customer_email is null or char_length(customer_email) <= 254),
  moderation_reason text check (moderation_reason is null or moderation_reason ~ '^[a-z_]{1,60}$'),
  view_count bigint not null default 0 check (view_count >= 0),
  paid_at timestamptz,
  activated_at timestamptz,
  removed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (status not in ('active', 'pending_review', 'removed') or paid_at is not null),
  check (status <> 'active' or (public_logo_path is not null and activated_at is not null)),
  check (status <> 'refunded' or refunded_at is not null)
);

alter table public.journey_sponsor_slots
  add constraint journey_sponsor_slots_reserved_order_fk
    foreign key (reserved_order_id) references public.journey_sponsor_orders(id) deferrable initially deferred,
  add constraint journey_sponsor_slots_occupied_order_fk
    foreign key (occupied_order_id) references public.journey_sponsor_orders(id) deferrable initially deferred;

create unique index journey_sponsor_orders_checkout_idx
  on public.journey_sponsor_orders (provider, provider_checkout_id) where provider_checkout_id is not null;
create unique index journey_sponsor_orders_payment_idx
  on public.journey_sponsor_orders (provider, provider_payment_id) where provider_payment_id is not null;
create unique index journey_sponsor_orders_one_holder_idx
  on public.journey_sponsor_orders (slot_id)
  where status in ('reserved', 'payment_pending', 'paid_pending_publish', 'active', 'pending_review');
create index journey_sponsor_orders_status_idx on public.journey_sponsor_orders (status, reservation_expires_at);

create table public.journey_sponsor_payments (
  provider text not null check (provider in ('dodo', 'fixture')),
  payment_id text not null check (char_length(payment_id) between 1 and 160),
  order_id uuid references public.journey_sponsor_orders(id) on delete restrict,
  checkout_id text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  tax_cents integer check (tax_cents is null or tax_cents >= 0),
  currency char(3),
  test_mode boolean,
  outcome text not null check (outcome in (
    'active', 'pending_review', 'refund_required', 'refund_requested', 'refunded', 'unmatched'
  )),
  reason text check (reason is null or reason ~ '^[a-z_]{1,60}$'),
  received_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (provider, payment_id)
);

create table public.journey_sponsor_view_events (
  order_id uuid not null references public.journey_sponsor_orders(id) on delete cascade,
  event_id uuid not null,
  visitor_hash text not null check (length(visitor_hash) = 64),
  network_hash text not null check (length(network_hash) = 64),
  occurred_at timestamptz not null,
  primary key (order_id, event_id)
);
create index journey_sponsor_views_visitor_idx
  on public.journey_sponsor_view_events (order_id, visitor_hash, occurred_at desc);
create index journey_sponsor_views_network_idx
  on public.journey_sponsor_view_events (network_hash, occurred_at desc);

alter table public.payment_webhook_events
  add column journey_sponsor_order_id uuid references public.journey_sponsor_orders(id) on delete set null;

create or replace function public.seed_journey_sponsor_slots()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_position integer;
begin
  if new.total_days <> 14 or new.lifecycle_state <> 'waiting' or new.starts_at is not null then return new; end if;
  for v_position in 1..10 loop
    insert into public.journey_sponsor_slots
      (journey_id, tier, position, price_cents, created_at, updated_at)
    values (new.id, 'regular', v_position, 5000, new.created_at, new.created_at)
    on conflict (journey_id, tier, position) do nothing;
  end loop;
  insert into public.journey_sponsor_slots
    (journey_id, tier, position, price_cents, created_at, updated_at)
  values (new.id, 'featured', 1, 10000, new.created_at, new.created_at)
  on conflict (journey_id, tier, position) do nothing;
  return new;
end;
$$;

create trigger seed_journey_sponsor_slots_after_insert
after insert on public.journeys for each row execute function public.seed_journey_sponsor_slots();

create or replace function public.reserve_journey_sponsor_slot(
  p_slot_id uuid,
  p_buyer_hash text,
  p_product_url text,
  p_product_name text,
  p_description text,
  p_private_logo_path text,
  p_logo_fit text,
  p_rights_confirmed boolean,
  p_provider text,
  p_provider_product_id text,
  p_test_mode boolean,
  p_provisional_minutes integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot public.journey_sponsor_slots%rowtype;
  v_journey public.journeys%rowtype;
  v_order_id uuid;
  v_public_id uuid;
  v_expires timestamptz;
begin
  if length(p_buyer_hash) <> 64 or p_rights_confirmed is distinct from true or p_provider not in ('dodo', 'fixture')
    or p_logo_fit not in ('crop', 'contain') or p_provisional_minutes not between 5 and 30 then
    raise exception 'invalid sponsor reservation' using errcode = '22023';
  end if;
  select * into v_slot from public.journey_sponsor_slots s where s.id = p_slot_id for update;
  if not found then raise exception 'slot not found' using errcode = 'P0002'; end if;
  select * into v_journey from public.journeys j where j.id = v_slot.journey_id for update;
  if v_journey.lifecycle_state not in ('waiting', 'scheduled', 'live')
    or (v_journey.lifecycle_state = 'live' and v_journey.ends_at <= p_now) then
    raise exception 'journey sales are closed' using errcode = '55000';
  end if;
  if v_slot.state <> 'available' then
    return jsonb_build_object('state', 'unavailable', 'slotId', v_slot.id);
  end if;
  v_expires := p_now + make_interval(mins => p_provisional_minutes);
  insert into public.journey_sponsor_orders (
    journey_id, slot_id, buyer_hash, tier, status, product_url, product_name, description,
    private_logo_path, logo_fit, rights_confirmed_at, expected_price_cents, currency,
    provider, provider_product_id, test_mode, reservation_expires_at, created_at, updated_at
  ) values (
    v_slot.journey_id, v_slot.id, p_buyer_hash, v_slot.tier, 'reserved', btrim(p_product_url),
    btrim(p_product_name), btrim(p_description), btrim(p_private_logo_path), p_logo_fit,
    p_now, v_slot.price_cents, v_slot.currency, p_provider, btrim(p_provider_product_id),
    p_test_mode, v_expires, p_now, p_now
  ) returning id, public_id into v_order_id, v_public_id;
  update public.journey_sponsor_slots set state = 'held', reserved_order_id = v_order_id,
    updated_at = p_now where id = v_slot.id;
  return jsonb_build_object('state', 'reserved', 'orderId', v_order_id,
    'publicId', v_public_id, 'journeyId', v_slot.journey_id, 'slotId', v_slot.id,
    'tier', v_slot.tier, 'priceCents', v_slot.price_cents, 'currency', v_slot.currency,
    'reservationExpiresAt', v_expires);
end;
$$;

create or replace function public.attach_journey_sponsor_checkout(
  p_order_id uuid,
  p_checkout_id text,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order public.journey_sponsor_orders%rowtype;
begin
  select * into v_order from public.journey_sponsor_orders o where o.id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_order.status not in ('reserved', 'payment_pending') or p_expires_at <= p_now
    or p_expires_at > p_now + interval '24 hours 5 minutes' then
    raise exception 'invalid checkout attachment' using errcode = '22023';
  end if;
  update public.journey_sponsor_orders set status = 'payment_pending',
    provider_checkout_id = btrim(p_checkout_id), reservation_expires_at = p_expires_at,
    updated_at = p_now where id = p_order_id;
  return jsonb_build_object('state', 'payment_pending', 'publicId', v_order.public_id,
    'expiresAt', p_expires_at);
end;
$$;

create or replace function public.confirm_journey_sponsor_payment(
  p_provider text,
  p_payment_id text,
  p_order_id uuid,
  p_checkout_id text,
  p_amount_cents integer,
  p_tax_cents integer,
  p_currency text,
  p_test_mode boolean,
  p_product_matches boolean,
  p_tax_inclusive boolean,
  p_public_logo_path text,
  p_customer_email text,
  p_flagged_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.journey_sponsor_orders%rowtype;
  v_slot public.journey_sponsor_slots%rowtype;
  v_journey public.journeys%rowtype;
  v_existing public.journey_sponsor_payments%rowtype;
  v_reason text;
  v_outcome text;
begin
  select * into v_existing from public.journey_sponsor_payments p
    where p.provider = p_provider and p.payment_id = p_payment_id;
  if found then return jsonb_build_object('outcome', v_existing.outcome,
    'orderId', v_existing.order_id, 'duplicate', true, 'reason', v_existing.reason); end if;

  select * into v_order from public.journey_sponsor_orders o where o.id = p_order_id for update;
  if found then
    select * into v_slot from public.journey_sponsor_slots s where s.id = v_order.slot_id for update;
    select * into v_journey from public.journeys j where j.id = v_order.journey_id for update;
  end if;
  v_reason := case
    when not found then 'unknown_order'
    when v_order.provider <> p_provider then 'provider_mismatch'
    when v_order.test_mode is distinct from p_test_mode then 'mode_mismatch'
    when v_order.provider_checkout_id is distinct from p_checkout_id then 'checkout_mismatch'
    when p_product_matches is distinct from true then 'product_mismatch'
    when upper(p_currency) <> v_order.currency then 'currency_mismatch'
    when (p_tax_inclusive and p_amount_cents <> v_order.expected_price_cents)
      or (not p_tax_inclusive and p_amount_cents - coalesce(p_tax_cents, 0) <> v_order.expected_price_cents)
      then 'amount_mismatch'
    when v_journey.lifecycle_state not in ('waiting', 'scheduled', 'live')
      or (v_journey.lifecycle_state = 'live' and v_journey.ends_at <= p_now) then 'journey_closed'
    when v_slot.reserved_order_id is distinct from v_order.id and v_slot.occupied_order_id is distinct from v_order.id
      then 'slot_conflict'
    when v_order.status not in ('reserved', 'payment_pending', 'paid_pending_publish', 'active', 'pending_review')
      then 'order_closed'
    else null end;

  if v_reason is not null then
    v_outcome := 'refund_required';
    if v_order.id is not null and v_order.status not in ('active', 'pending_review') then
      update public.journey_sponsor_orders set status = 'refund_required',
        provider_payment_id = p_payment_id, paid_at = p_now, customer_email = nullif(lower(btrim(p_customer_email)), ''),
        moderation_reason = v_reason, updated_at = p_now where id = v_order.id;
    end if;
  else
    v_outcome := case when p_flagged_reason is null then 'active' else 'pending_review' end;
    update public.journey_sponsor_orders set status = v_outcome,
      provider_payment_id = p_payment_id, public_logo_path = btrim(p_public_logo_path),
      paid_at = coalesce(paid_at, p_now), activated_at = case when v_outcome = 'active' then coalesce(activated_at, p_now) end,
      customer_email = nullif(lower(btrim(p_customer_email)), ''), moderation_reason = p_flagged_reason,
      updated_at = p_now where id = v_order.id;
    update public.journey_sponsor_slots set
      state = case when v_outcome = 'active' then 'occupied' else 'held' end,
      occupied_order_id = case when v_outcome = 'active' then v_order.id else null end,
      reserved_order_id = case when v_outcome = 'active' then null else v_order.id end,
      updated_at = p_now where id = v_order.slot_id;
  end if;

  insert into public.journey_sponsor_payments (
    provider, payment_id, order_id, checkout_id, amount_cents, tax_cents, currency,
    test_mode, outcome, reason, received_at, updated_at
  ) values (p_provider, p_payment_id, v_order.id, p_checkout_id, p_amount_cents, p_tax_cents,
    upper(p_currency), p_test_mode, v_outcome, v_reason, p_now, p_now);
  return jsonb_build_object('outcome', v_outcome, 'orderId', v_order.id,
    'publicId', v_order.public_id, 'duplicate', false, 'reason', v_reason);
end;
$$;

create or replace function public.record_journey_sponsor_view(
  p_public_id uuid,
  p_event_id uuid,
  p_visitor_hash text,
  p_network_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order public.journey_sponsor_orders%rowtype; v_count bigint;
begin
  if length(p_visitor_hash) <> 64 or length(p_network_hash) <> 64 then
    raise exception 'invalid metric identity' using errcode = '22023';
  end if;
  select * into v_order from public.journey_sponsor_orders o
    where o.public_id = p_public_id and o.status = 'active' for update;
  if not found then raise exception 'placement not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.journey_sponsor_view_events e
      where e.order_id = v_order.id and e.event_id = p_event_id) then
    return jsonb_build_object('accepted', false, 'duplicate', true, 'views', v_order.view_count);
  end if;
  if exists (select 1 from public.journey_sponsor_view_events e
      where e.order_id = v_order.id and e.visitor_hash = p_visitor_hash
        and e.occurred_at > p_now - interval '10 seconds')
    or (select count(*) from public.journey_sponsor_view_events e
      where e.network_hash = p_network_hash and e.occurred_at > p_now - interval '1 minute') >= 60 then
    return jsonb_build_object('accepted', false, 'rateLimited', true, 'views', v_order.view_count);
  end if;
  insert into public.journey_sponsor_view_events (order_id, event_id, visitor_hash, network_hash, occurred_at)
  values (v_order.id, p_event_id, p_visitor_hash, p_network_hash, p_now);
  update public.journey_sponsor_orders set view_count = view_count + 1, updated_at = p_now
    where id = v_order.id returning view_count into v_count;
  return jsonb_build_object('accepted', true, 'views', v_count);
end;
$$;

create or replace function public.admin_journey_sponsor_action(
  p_order_id uuid,
  p_action text,
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order public.journey_sponsor_orders%rowtype;
begin
  select * into v_order from public.journey_sponsor_orders o where o.id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform 1 from public.journey_sponsor_slots s where s.id = v_order.slot_id for update;
  if p_action = 'approve' and v_order.status = 'pending_review' then
    update public.journey_sponsor_orders set status = 'active', activated_at = coalesce(activated_at, p_now),
      moderation_reason = null, updated_at = p_now where id = p_order_id;
    update public.journey_sponsor_slots set state = 'occupied', occupied_order_id = p_order_id,
      reserved_order_id = null, updated_at = p_now where id = v_order.slot_id;
    return jsonb_build_object('state', 'active', 'orderId', p_order_id);
  end if;
  if p_action = 'remove' and v_order.status in ('active', 'pending_review') then
    update public.journey_sponsor_orders set status = 'refund_required', removed_at = p_now,
      moderation_reason = coalesce(nullif(btrim(p_reason), ''), 'moderation_removed'), updated_at = p_now
      where id = p_order_id;
    update public.journey_sponsor_slots set state = 'held', occupied_order_id = null,
      reserved_order_id = p_order_id, updated_at = p_now where id = v_order.slot_id;
    return jsonb_build_object('state', 'refund_required', 'orderId', p_order_id);
  end if;
  raise exception 'invalid sponsor action' using errcode = '55000';
end;
$$;

create or replace function public.record_journey_sponsor_refund(
  p_provider text,
  p_payment_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_payment public.journey_sponsor_payments%rowtype; v_order public.journey_sponsor_orders%rowtype;
begin
  select * into v_payment from public.journey_sponsor_payments p
    where p.provider = p_provider and p.payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('state', 'unmatched'); end if;
  select * into v_order from public.journey_sponsor_orders o where o.id = v_payment.order_id for update;
  update public.journey_sponsor_payments set outcome = 'refunded', updated_at = p_now
    where provider = p_provider and payment_id = p_payment_id;
  update public.journey_sponsor_orders set status = 'refunded', refunded_at = p_now,
    updated_at = p_now where id = v_order.id;
  update public.journey_sponsor_slots set state = 'available', reserved_order_id = null,
    occupied_order_id = null, updated_at = p_now
    where id = v_order.slot_id and (reserved_order_id = v_order.id or occupied_order_id = v_order.id);
  return jsonb_build_object('state', 'refunded', 'orderId', v_order.id);
end;
$$;

create or replace function public.release_journey_sponsor_reservation(
  p_order_id uuid,
  p_provider_terminal boolean,
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order public.journey_sponsor_orders%rowtype;
begin
  if p_provider_terminal is distinct from true then
    raise exception 'provider state must be terminal' using errcode = '22023';
  end if;
  select * into v_order from public.journey_sponsor_orders o where o.id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform 1 from public.journey_sponsor_slots s where s.id = v_order.slot_id for update;
  if v_order.status not in ('reserved', 'payment_pending') then
    return jsonb_build_object('state', v_order.status, 'orderId', v_order.id);
  end if;
  update public.journey_sponsor_orders set status = case when p_reason = 'cancelled' then 'cancelled' else 'expired' end,
    moderation_reason = coalesce(nullif(btrim(p_reason), ''), 'checkout_expired'), updated_at = p_now
    where id = v_order.id;
  update public.journey_sponsor_slots set state = 'available', reserved_order_id = null,
    occupied_order_id = null, updated_at = p_now
    where id = v_order.slot_id and reserved_order_id = v_order.id;
  return jsonb_build_object('state', 'released', 'orderId', v_order.id);
end;
$$;

create or replace function public.mark_journey_sponsor_refund_requested(
  p_provider text,
  p_payment_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_payment public.journey_sponsor_payments%rowtype;
begin
  select * into v_payment from public.journey_sponsor_payments p
    where p.provider = p_provider and p.payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('state', 'unmatched'); end if;
  update public.journey_sponsor_payments set outcome = 'refund_requested', updated_at = p_now
    where provider = p_provider and payment_id = p_payment_id and outcome = 'refund_required';
  update public.journey_sponsor_orders set status = 'refund_requested', updated_at = p_now
    where id = v_payment.order_id and status = 'refund_required';
  return jsonb_build_object('state', 'refund_requested', 'orderId', v_payment.order_id);
end;
$$;

create or replace function public.record_journey_sponsor_chargeback(
  p_provider text,
  p_payment_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_payment public.journey_sponsor_payments%rowtype; v_order public.journey_sponsor_orders%rowtype;
begin
  select * into v_payment from public.journey_sponsor_payments p
    where p.provider = p_provider and p.payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('state', 'unmatched'); end if;
  select * into v_order from public.journey_sponsor_orders o where o.id = v_payment.order_id for update;
  update public.journey_sponsor_orders set status = 'chargeback', removed_at = coalesce(removed_at, p_now),
    moderation_reason = 'chargeback', updated_at = p_now where id = v_order.id;
  update public.journey_sponsor_slots set state = 'available', reserved_order_id = null,
    occupied_order_id = null, updated_at = p_now
    where id = v_order.slot_id and (reserved_order_id = v_order.id or occupied_order_id = v_order.id);
  return jsonb_build_object('state', 'chargeback', 'orderId', v_order.id);
end;
$$;

alter table public.journey_sponsor_slots enable row level security;
alter table public.journey_sponsor_orders enable row level security;
alter table public.journey_sponsor_payments enable row level security;
alter table public.journey_sponsor_view_events enable row level security;

revoke all on public.journey_sponsor_slots, public.journey_sponsor_orders,
  public.journey_sponsor_payments, public.journey_sponsor_view_events from anon, authenticated;
revoke all on function public.seed_journey_sponsor_slots(),
  public.reserve_journey_sponsor_slot(uuid, text, text, text, text, text, text, boolean, text, text, boolean, integer, timestamptz),
  public.attach_journey_sponsor_checkout(uuid, text, timestamptz, timestamptz),
  public.confirm_journey_sponsor_payment(text, text, uuid, text, integer, integer, text, boolean, boolean, boolean, text, text, text, timestamptz),
  public.record_journey_sponsor_view(uuid, uuid, text, text, timestamptz),
  public.admin_journey_sponsor_action(uuid, text, text, timestamptz),
  public.record_journey_sponsor_refund(text, text, timestamptz),
  public.release_journey_sponsor_reservation(uuid, boolean, text, timestamptz),
  public.mark_journey_sponsor_refund_requested(text, text, timestamptz),
  public.record_journey_sponsor_chargeback(text, text, timestamptz) from public, anon, authenticated;

grant select, insert, update, delete on public.journey_sponsor_slots, public.journey_sponsor_orders,
  public.journey_sponsor_payments, public.journey_sponsor_view_events to service_role;
grant execute on function public.reserve_journey_sponsor_slot(uuid, text, text, text, text, text, text, boolean, text, text, boolean, integer, timestamptz),
  public.attach_journey_sponsor_checkout(uuid, text, timestamptz, timestamptz),
  public.confirm_journey_sponsor_payment(text, text, uuid, text, integer, integer, text, boolean, boolean, boolean, text, text, text, timestamptz),
  public.record_journey_sponsor_view(uuid, uuid, text, text, timestamptz),
  public.admin_journey_sponsor_action(uuid, text, text, timestamptz),
  public.record_journey_sponsor_refund(text, text, timestamptz),
  public.release_journey_sponsor_reservation(uuid, boolean, text, timestamptz),
  public.mark_journey_sponsor_refund_requested(text, text, timestamptz),
  public.record_journey_sponsor_chargeback(text, text, timestamptz) to service_role;
