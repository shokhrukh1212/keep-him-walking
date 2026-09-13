-- Reactions count the watchers who ask, not the clicks that arrive.
--
-- Corrects migrations 0015, 0034 and 0036. The owner approved these fixes on
-- 13 September 2026 after a review of what hundreds of simultaneous clicks do:
--   * Every click took the journey_runtime row lock before it was counted, so a
--     burst of clicks queued behind one another and behind every heartbeat.
--   * A click counted whether or not its visitor was watching, and a request
--     without a cookie arrived as a new visitor, so one script could fill a room's
--     threshold by itself.
--   * During the 120 watched seconds he rests after a crowd action, clicks kept
--     counting past the threshold ("400/300") while nothing could happen.
--   * Fixed 30-second buckets split one crowd into two halves that never added up.
--
-- Now each visitor holds one row per reaction per day with their latest request. A
-- request counts only from a confirmed watcher, at most once a rolling minute, and
-- the tally is the number of distinct watchers who asked in the last thirty
-- seconds. Nothing is counted while he rests. Only the request that completes the
-- crowd waits for the authority lock, and it re-checks the rest under that lock.
-- submit_reaction_v2 also limits each network (a keyed hash, never an address) and
-- each visitor per minute, so the route needs no separate rate-limit round trip.
--
-- reaction_windows stays for history; nothing reads or writes it any more. The
-- original submit_reaction signature stays callable for rollback and counts
-- watchers the same way.

-- 1. The walking pace, in one place ------------------------------------------------

-- A crowd booking plants his distance at the walking pace. Keeping the number in one
-- function lets every authority function change pace together.
create or replace function public.walking_metres_per_second()
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 1.25::double precision;
$$;

revoke all on function public.walking_metres_per_second() from public, anon, authenticated;

-- 2. One row per watcher per reaction -----------------------------------------------

create table public.reaction_requests (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  kind public.reaction_kind not null,
  visitor_hash text not null check (char_length(visitor_hash) between 16 and 128),
  requested_at timestamptz not null,
  primary key (country_day_id, kind, visitor_hash)
);

-- Only the last minute ever matters, so rows are pruned from the oldest end.
create index reaction_requests_requested_at_idx
  on public.reaction_requests (requested_at);

alter table public.reaction_requests enable row level security;
revoke all on public.reaction_requests from anon, authenticated;

-- 3. Counting one request -----------------------------------------------------------

create or replace function public.reaction_request_core(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_kind public.reaction_kind,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns table (
  out_status text,
  out_count integer,
  out_threshold integer,
  out_scheduled_at integer,
  out_retry_after_seconds integer,
  out_rest_until_active_second integer,
  out_active_seconds numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_motion_kind text;
  v_duration numeric;
  v_watchers bigint;
  v_threshold integer;
  v_last_request timestamptz;
  v_count integer;
  v_projection record;
  v_projected_active numeric;
  v_active_second integer;
  v_rest_from integer;
  v_runtime_distance double precision;
  v_candidate integer;
  v_blocked_until numeric;
  v_scheduled integer := null;
  v_frozen_distance double precision;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;
  if p_visitor_hash is null or char_length(p_visitor_hash) < 16 then
    raise exception 'invalid visitor' using errcode = '22023';
  end if;

  v_motion_kind := case p_kind when 'water' then 'drink' else p_kind::text end;
  v_duration := public.crowd_action_duration_seconds(v_motion_kind);

  select count(distinct pl.visitor_hash) into v_watchers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;
  v_threshold := public.reaction_threshold(coalesce(v_watchers, 0));

  -- Only a confirmed watcher can ask.
  if not exists (
    select 1
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visitor_hash = p_visitor_hash
      and pl.visible
      and pl.scene_ready
      and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now
  ) then
    return query select 'not_watching'::text, 0, v_threshold,
      null::integer, null::integer, null::integer, null::numeric;
    return;
  end if;

  -- One request of each kind per watcher per rolling minute.
  select rr.requested_at into v_last_request
  from public.reaction_requests rr
  where rr.country_day_id = p_country_day_id
    and rr.kind = p_kind
    and rr.visitor_hash = p_visitor_hash;

  if v_last_request is not null and v_last_request > p_now - interval '60 seconds' then
    select count(*)::integer into v_count
    from public.reaction_requests rr
    where rr.country_day_id = p_country_day_id
      and rr.kind = p_kind
      and rr.requested_at > p_now - interval '30 seconds';
    return query select 'cooldown'::text, v_count, v_threshold, null::integer,
      least(60, greatest(1, ceil(60 - extract(epoch from p_now - v_last_request))))::integer,
      null::integer, null::numeric;
    return;
  end if;

  -- He rests for 120 watched seconds after doing what the crowd asked. Nothing counts
  -- meanwhile, so a tally can never pass its threshold with nothing able to happen.
  select * into v_projection from public.read_journey_runtime_v6(
    p_country_day_id, p_now, p_ttl_seconds, 1.8, 5
  );
  v_projected_active := greatest(coalesce(v_projection.out_global_active_seconds, 0), 0);
  v_active_second := floor(v_projected_active)::integer;

  select max(sa.at_active_second) into v_rest_from
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.source = 'crowd'
    and sa.kind = v_motion_kind
    and sa.cancelled_at is null
    and sa.at_active_second > v_active_second - 120;

  if v_rest_from is not null then
    return query select 'resting'::text, 0, v_threshold, null::integer, null::integer,
      v_rest_from + 120, v_projected_active;
    return;
  end if;

  -- Record the request. Two arriving together from one watcher count once.
  insert into public.reaction_requests as rr (country_day_id, kind, visitor_hash, requested_at)
  values (p_country_day_id, p_kind, p_visitor_hash, p_now)
  on conflict (country_day_id, kind, visitor_hash) do update
    set requested_at = excluded.requested_at
    where rr.requested_at <= p_now - interval '60 seconds';

  if not found then
    select count(*)::integer into v_count
    from public.reaction_requests rr
    where rr.country_day_id = p_country_day_id
      and rr.kind = p_kind
      and rr.requested_at > p_now - interval '30 seconds';
    return query select 'cooldown'::text, v_count, v_threshold, null::integer, 60,
      null::integer, v_projected_active;
    return;
  end if;

  -- A request older than ten minutes can never count again. The work per call is
  -- bounded, and rows another request is already pruning are skipped, not waited for.
  delete from public.reaction_requests pruned
  where pruned.ctid in (
    select expired.ctid
    from public.reaction_requests expired
    where expired.requested_at < p_now - interval '10 minutes'
    order by expired.requested_at
    limit 64
    for update skip locked
  );

  select count(*)::integer into v_count
  from public.reaction_requests rr
  where rr.country_day_id = p_country_day_id
    and rr.kind = p_kind
    and rr.requested_at > p_now - interval '30 seconds';

  if v_count < v_threshold then
    return query select 'counted'::text, v_count, v_threshold, null::integer, null::integer,
      null::integer, v_projected_active;
    return;
  end if;

  -- Only the request that completes the crowd waits for the authority lock.
  select jr.global_distance_metres into v_runtime_distance
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  if not found then
    return query select 'no_runtime'::text, v_count, v_threshold, null::integer, null::integer,
      null::integer, v_projected_active;
    return;
  end if;

  -- Another request may have booked the action while this one waited for the lock.
  select * into v_projection from public.read_journey_runtime_v6(
    p_country_day_id, p_now, p_ttl_seconds, 1.8, 5
  );
  v_projected_active := greatest(coalesce(v_projection.out_global_active_seconds, 0), 0);
  v_active_second := floor(v_projected_active)::integer;

  select max(sa.at_active_second) into v_rest_from
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.source = 'crowd'
    and sa.kind = v_motion_kind
    and sa.cancelled_at is null
    and sa.at_active_second > v_active_second - 120;

  if v_rest_from is not null then
    return query select 'resting'::text, 0, v_threshold, null::integer, null::integer,
      v_rest_from + 120, v_projected_active;
    return;
  end if;

  v_candidate := v_active_second + 2;
  while v_candidate <= v_active_second + 120 and v_scheduled is null loop
    -- A journey activity nobody has started yet gives its slot to the crowd.
    update public.scheduled_actions sa
    set cancelled_at = p_now
    where sa.country_day_id = p_country_day_id
      and sa.source <> 'crowd'
      and sa.cancelled_at is null
      and sa.at_active_second > v_projected_active + 3
      and sa.end_active_second > v_candidate
      and sa.at_active_second < v_candidate + v_duration;

    select max(sa.end_active_second) into v_blocked_until
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.cancelled_at is null
      and sa.end_active_second > v_candidate
      and sa.at_active_second < v_candidate + v_duration;

    if v_blocked_until is not null then
      -- Queue right after whatever is already playing.
      v_candidate := greatest(v_candidate + 1, ceil(v_blocked_until)::integer);
    elsif exists (
      select 1 from public.scheduled_actions sa
      where sa.country_day_id = p_country_day_id
        and sa.at_active_second = v_candidate
    ) then
      v_candidate := v_candidate + 1;
    else
      v_frozen_distance := greatest(
        0,
        coalesce(v_projection.out_global_distance_metres, v_runtime_distance)
          + greatest(
              0,
              v_candidate - v_projected_active - public.action_overlap_seconds(
                p_country_day_id, v_projected_active, v_candidate
              )
            ) * public.walking_metres_per_second()
      );
      insert into public.scheduled_actions (
        country_day_id, kind, at_active_second, end_active_second,
        frozen_distance_metres, source
      ) values (
        p_country_day_id, v_motion_kind, v_candidate,
        v_candidate + v_duration, v_frozen_distance, 'crowd'
      )
      on conflict (country_day_id, at_active_second) do nothing;
      if found then
        v_scheduled := v_candidate;
      else
        v_candidate := v_candidate + 1;
      end if;
    end if;
  end loop;

  if v_scheduled is null then
    return query select 'counted'::text, v_count, v_threshold, null::integer, null::integer,
      null::integer, v_projected_active;
    return;
  end if;

  return query select 'scheduled'::text, 0, v_threshold, v_scheduled, null::integer,
    v_scheduled + 120, v_projected_active;
end;
$$;

-- 4. The route's one call -----------------------------------------------------------

create or replace function public.submit_reaction_v2(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_network_hash text,
  p_kind public.reaction_kind,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns table (
  out_status text,
  out_count integer,
  out_threshold integer,
  out_scheduled_at integer,
  out_retry_after_seconds integer,
  out_rest_until_active_second integer,
  out_reactions jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_core record;
  v_window_left integer;
begin
  if p_network_hash is null or char_length(p_network_hash) < 16 then
    raise exception 'invalid network key' using errcode = '22023';
  end if;
  if p_visitor_hash is null or char_length(p_visitor_hash) < 16 then
    raise exception 'invalid visitor' using errcode = '22023';
  end if;
  v_window_left := 60 - (floor(extract(epoch from p_now))::bigint % 60)::integer;

  -- More reactions than a room of people could send, from one network or from one
  -- visitor, are refused before anything else is read.
  if not public.consume_mutation_rate_limit(p_network_hash, 'reaction_network', 60, 60, p_now) then
    return query select 'rate_limited'::text, null::integer, null::integer, null::integer,
      v_window_left, null::integer, null::jsonb;
    return;
  end if;
  if not public.consume_mutation_rate_limit(p_visitor_hash, 'reaction', 12, 60, p_now) then
    return query select 'rate_limited'::text, null::integer, null::integer, null::integer,
      v_window_left, null::integer, null::jsonb;
    return;
  end if;

  select * into v_core
  from public.reaction_request_core(
    p_country_day_id, p_visitor_hash, p_kind, p_now, p_ttl_seconds
  );

  -- The answer carries the board, so the page that asked needs no second read.
  return query select
    v_core.out_status,
    v_core.out_count,
    v_core.out_threshold,
    v_core.out_scheduled_at,
    v_core.out_retry_after_seconds,
    v_core.out_rest_until_active_second,
    case
      when v_core.out_active_seconds is null then null::jsonb
      else public.read_day_reactions(p_country_day_id, p_now, v_core.out_active_seconds)
    end;
end;
$$;

-- 5. The rollback signature ---------------------------------------------------------

create or replace function public.submit_reaction(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_kind public.reaction_kind,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns table (
  out_count integer,
  out_threshold integer,
  out_scheduled_at integer,
  out_rate_limited boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select core.out_count, core.out_threshold, core.out_scheduled_at, core.out_status = 'cooldown'
  from public.reaction_request_core(
    p_country_day_id, p_visitor_hash, p_kind, p_now, p_ttl_seconds
  ) core;
$$;

-- 6. The board every payload carries -------------------------------------------------

create or replace function public.read_day_reactions(
  p_country_day_id uuid,
  p_now timestamptz,
  p_global_active_seconds numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_active numeric;
  v_active_second integer;
  v_rest jsonb;
  v_counts jsonb;
  v_scheduled jsonb;
  v_next jsonb;
  v_photos jsonb;
begin
  v_active := greatest(coalesce(p_global_active_seconds, 0), 0);
  v_active_second := floor(v_active)::integer;

  -- The watched second each reaction can be asked for again, while he rests.
  select jsonb_build_object(
    'wave', max(sa.at_active_second) filter (where sa.kind = 'wave') + 120,
    'water', max(sa.at_active_second) filter (where sa.kind = 'drink') + 120,
    'photo', max(sa.at_active_second) filter (where sa.kind = 'photo') + 120
  ) into v_rest
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.source = 'crowd'
    and sa.cancelled_at is null
    and sa.at_active_second > v_active_second - 120;

  -- Distinct watchers who asked in the last thirty seconds; none while he rests.
  select jsonb_build_object(
    'wave', case when v_rest ->> 'wave' is null
      then count(*) filter (where rr.kind = 'wave') else 0 end,
    'water', case when v_rest ->> 'water' is null
      then count(*) filter (where rr.kind = 'water') else 0 end,
    'photo', case when v_rest ->> 'photo' is null
      then count(*) filter (where rr.kind = 'photo') else 0 end
  ) into v_counts
  from public.reaction_requests rr
  where rr.country_day_id = p_country_day_id
    and rr.requested_at > p_now - interval '30 seconds';

  -- Recent and upcoming rows, cancelled ones included so every client drops them.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', recent.kind,
      'atActiveSecond', recent.at_active_second,
      'endsAtActiveSecond', recent.end_active_second,
      'frozenDistanceMetres', recent.frozen_distance_metres,
      'source', recent.source,
      'variant', recent.variant,
      'occurrenceKey', recent.occurrence_key,
      'cancelled', recent.cancelled_at is not null
    ) order by recent.at_active_second
  ), '[]'::jsonb) into v_scheduled
  from (
    select sa.kind, sa.at_active_second, sa.end_active_second, sa.frozen_distance_metres,
      sa.source, sa.variant, sa.occurrence_key, sa.cancelled_at
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.end_active_second > v_active_second - 600
    order by sa.at_active_second desc limit 16
  ) recent;

  select jsonb_build_object(
    'kind', sa.kind,
    'atActiveSecond', sa.at_active_second,
    'endsAtActiveSecond', sa.end_active_second,
    'frozenDistanceMetres', sa.frozen_distance_metres,
    'source', sa.source,
    'variant', sa.variant,
    'occurrenceKey', sa.occurrence_key,
    'cancelled', false
  ) into v_next
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.cancelled_at is null
    and sa.end_active_second >= v_active_second
  order by sa.at_active_second limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'atActiveSecond', photo.at_active_second, 'storagePath', photo.storage_path
  ) order by photo.at_active_second desc), '[]'::jsonb) into v_photos
  from (
    select dp.at_active_second, dp.storage_path from public.day_photos dp
    where dp.country_day_id = p_country_day_id
    order by dp.at_active_second desc limit 6
  ) photo;

  return jsonb_build_object(
    'counts', coalesce(v_counts, jsonb_build_object('wave', 0, 'water', 0, 'photo', 0)),
    'rest', v_rest,
    'scheduled', v_scheduled,
    'nextScheduledAction', v_next,
    'photos', v_photos,
    'walkingClock', jsonb_build_object(
      'anchorActiveSeconds', v_active,
      'heldActiveSeconds', public.action_overlap_seconds(p_country_day_id, 0, v_active)
    )
  );
end;
$$;

-- 7. The board in one call ------------------------------------------------------------

create or replace function public.read_reactions_now(
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
  v_projection record;
begin
  select * into v_projection from public.read_journey_runtime_v6(
    p_country_day_id, p_now, p_ttl_seconds, 1.8, 5
  );
  return public.read_day_reactions(
    p_country_day_id, p_now, coalesce(v_projection.out_global_active_seconds, 0)
  );
end;
$$;

-- 8. Grants -------------------------------------------------------------------------------

revoke all on function public.reaction_request_core(uuid, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated, service_role;

revoke all on function public.submit_reaction_v2(uuid, text, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.submit_reaction_v2(uuid, text, text, public.reaction_kind, timestamptz, integer)
  to service_role;

revoke all on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  to service_role;

revoke all on function public.read_day_reactions(uuid, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.read_day_reactions(uuid, timestamptz, numeric) to service_role;

revoke all on function public.read_reactions_now(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.read_reactions_now(uuid, timestamptz, integer) to service_role;
