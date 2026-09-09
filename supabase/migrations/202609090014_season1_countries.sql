-- Season 1 watchers by country (P7 / 04 §2 item 7).
-- The lease carries a two-letter edge-derived country code and never an IP.
-- v4 remains callable as the rollback contract.

alter table public.presence_leases
  add column country_code char(2)
    check (country_code is null or country_code ~ '^[A-Z]{2}$');

create table public.country_day_watch (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  watch_seconds integer not null default 0 check (watch_seconds >= 0),
  peak_watchers integer not null default 0 check (peak_watchers >= 0),
  updated_at timestamptz not null default now(),
  primary key (country_day_id, country_code)
);

alter table public.country_day_watch enable row level security;
revoke all on public.country_day_watch from anon, authenticated;

create index country_day_watch_leaderboard_idx
  on public.country_day_watch (country_day_id, watch_seconds desc);

-- Normalizes anything the edge header produced into a storable code. An absent or
-- malformed header is the explicit unknown country, never a guess.
create or replace function public.normalize_country_code(p_country_code text)
returns char(2)
language sql
immutable
as $$
  select case
    when p_country_code is null then 'ZZ'
    when upper(trim(p_country_code)) ~ '^[A-Z]{2}$' then upper(trim(p_country_code))::char(2)
    else 'ZZ'
  end;
$$;

create or replace function public.record_presence_heartbeat_v5(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_session_hash text,
  p_state text,
  p_scene_ready boolean,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real,
  p_first_watcher_gap_seconds integer,
  p_country_code text
)
returns table (
  out_active_viewers bigint,
  out_global_steps bigint,
  out_visitor_active_seconds numeric,
  out_accounted_at timestamptz,
  out_global_active_seconds numeric,
  out_global_distance_metres double precision,
  out_pace_rate real,
  out_waiting_since timestamptz,
  out_woke_him boolean,
  out_country_code char(2)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_country_code char(2);
  v_before numeric(18,3) := 0;
  v_after numeric(18,3) := 0;
  v_delta numeric(18,3);
  v_country_viewers bigint;
begin
  v_country_code := public.normalize_country_code(p_country_code);

  -- The caller owns its own lease row, keyed by session hash, so reading its
  -- watched total before delegating cannot race another visitor's heartbeat.
  select pl.active_seconds into v_before
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.session_hash = p_session_hash;

  v_before := coalesce(v_before, 0);

  -- v4 owns the authority row, distance, pace and the waiting transition. Its
  -- row lock is held for the remainder of this transaction, so every write
  -- below is serialized against other heartbeats for the same day.
  select * into v_result
  from public.record_presence_heartbeat_v4(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap,
    p_first_watcher_gap_seconds
  );

  update public.presence_leases pl
  set country_code = v_country_code
  where pl.country_day_id = p_country_day_id
    and pl.session_hash = p_session_hash;

  select pl.active_seconds into v_after
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.session_hash = p_session_hash;

  -- Only the caller's own visible delta is credited, capped at the lease TTL for
  -- the same reason v3 caps it: a returning tab may not claim the gap.
  v_delta := least(greatest(coalesce(v_after, 0) - v_before, 0), p_ttl_seconds::numeric);

  select count(distinct pl.visitor_hash)
    into v_country_viewers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.country_code = v_country_code
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_result.out_accounted_at;

  insert into public.country_day_watch as cdw (
    country_day_id,
    country_code,
    watch_seconds,
    peak_watchers,
    updated_at
  ) values (
    p_country_day_id,
    v_country_code,
    round(v_delta)::integer,
    coalesce(v_country_viewers, 0),
    v_result.out_accounted_at
  )
  on conflict (country_day_id, country_code) do update set
    watch_seconds = cdw.watch_seconds + round(v_delta)::integer,
    peak_watchers = greatest(cdw.peak_watchers, coalesce(v_country_viewers, 0)),
    updated_at = v_result.out_accounted_at;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_result.out_global_distance_metres,
    v_result.out_pace_rate,
    v_result.out_waiting_since,
    v_result.out_woke_him,
    v_country_code;
end;
$$;

-- Live counts come from unexpired leases; carried time comes from the day's
-- confirmed aggregate. Neither number is ever invented by the browser.
create or replace function public.read_country_day_watch(
  p_country_day_id uuid,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_live jsonb;
  v_top jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object('code', live_rows.code, 'watchers', live_rows.watchers)
      order by live_rows.watchers desc, live_rows.code
    ),
    '[]'::jsonb
  )
  into v_live
  from (
    select
      coalesce(pl.country_code, 'ZZ')::char(2) as code,
      count(distinct pl.visitor_hash) as watchers
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visible
      and pl.scene_ready
      and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now
    group by coalesce(pl.country_code, 'ZZ')
    order by count(distinct pl.visitor_hash) desc, coalesce(pl.country_code, 'ZZ')
    limit 8
  ) live_rows;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('code', top_rows.country_code, 'watchSeconds', top_rows.watch_seconds)
      order by top_rows.watch_seconds desc, top_rows.country_code
    ),
    '[]'::jsonb
  )
  into v_top
  from (
    select cdw.country_code, cdw.watch_seconds
    from public.country_day_watch cdw
    where cdw.country_day_id = p_country_day_id
      and cdw.watch_seconds > 0
    order by cdw.watch_seconds desc, cdw.country_code
    limit 5
  ) top_rows;

  return jsonb_build_object('live', v_live, 'top', v_top);
end;
$$;

create or replace function public.read_bootstrap_bundle_v6(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_pace_cap real
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_bundle jsonb;
  v_country_day_id uuid;
  v_countries jsonb;
begin
  v_result := public.read_bootstrap_bundle_v5(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_rate_limit,
    p_rate_window_seconds,
    p_pace_cap
  );

  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;

  v_bundle := v_result -> 'bundle';
  v_country_day_id := (v_bundle #>> '{country_day,id}')::uuid;
  v_countries := public.read_country_day_watch(v_country_day_id, p_real_now, p_ttl_seconds);

  v_bundle := jsonb_set(v_bundle, '{countries}', coalesce(v_countries, '{}'::jsonb), true);
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.normalize_country_code(text)
  from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v5(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.read_country_day_watch(uuid, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v6(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;

grant execute on function public.normalize_country_code(text) to service_role;
grant execute on function public.record_presence_heartbeat_v5(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.read_country_day_watch(uuid, timestamptz, integer)
  to service_role;
grant execute on function public.read_bootstrap_bundle_v6(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
