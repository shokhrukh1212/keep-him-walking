-- Journey activities (refinements, 12 September 2026).
--
-- Every stop now owns a server window. Story beats, his own occasional actions and
-- residents' conversations and greetings join crowd reactions in scheduled_actions,
-- so the existing distance hold (action_overlap_seconds inside heartbeat v12 and
-- runtime v6) pauses distance, and therefore the road, for all of them. Before this
-- migration only crowd reactions were windows: stories and system actions were
-- derived in the browser while distance kept accruing, so the road slid under a
-- standing traveler.
--
-- Crowd reactions keep priority. A reaction cancels a scheduled activity that has
-- not started for anyone, or queues immediately after one that has. Cancelled rows
-- are kept (the client learns of the cancellation) but never hold time.
--
-- Crowd windows become the approved takes at their recorded length plus the 1.2 s
-- stop entry, instead of squeezing Waving (4.73 s) into 2.5 s and Drinking (8.87 s)
-- into 5.5 s.
--
-- The heartbeat, runtime and bootstrap signatures are unchanged. read_day_reactions,
-- which all three already return, gains each row's source, script and occurrence and
-- a walking-clock anchor (watched seconds and the time held inside stops up to them),
-- so a viewer's painting no longer depends on how many old rows it was sent.

-- 1. Table -------------------------------------------------------------------

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.scheduled_actions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%kind%'
  loop
    execute format('alter table public.scheduled_actions drop constraint %I', v_constraint);
  end loop;
end;
$$;

alter table public.scheduled_actions
  add column variant text,
  add column occurrence_key text,
  add column cancelled_at timestamptz;

alter table public.scheduled_actions
  add constraint scheduled_actions_kind_check check (kind in (
    'wave', 'drink', 'photo', 'phone', 'look_around', 'stretch', 'tie_shoe', 'yawn',
    'lean', 'laugh', 'stumble', 'cheer', 'conversation', 'greeting'
  )),
  add constraint scheduled_actions_variant_check
    check (variant is null or variant ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  add constraint scheduled_actions_occurrence_key_check
    check (occurrence_key is null or occurrence_key ~ '^[a-z0-9][a-z0-9:_-]{0,79}$'),
  add constraint scheduled_actions_crowd_shape_check
    check (source <> 'crowd' or (variant is null and occurrence_key is null));

-- One live row per planned occurrence per day. A cancelled occurrence may be
-- planned again once the crowd's reaction has finished.
create unique index scheduled_actions_occurrence_idx
  on public.scheduled_actions (country_day_id, occurrence_key)
  where occurrence_key is not null and cancelled_at is null;

-- 2. Durations and the distance hold -------------------------------------------

create or replace function public.crowd_action_duration_seconds(p_kind text)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  -- The 1.2 s stop entry plus the approved take, played whole. Mirrored by
  -- CROWD_ACTION_DURATION_SECONDS in src/lib/world/activities.ts.
  select case p_kind
    when 'wave' then 5.930
    when 'drink' then 10.070
    when 'photo' then 5.200
    else null
  end;
$$;

create or replace function public.action_overlap_seconds(
  p_country_day_id uuid,
  p_from_active_second numeric,
  p_to_active_second numeric
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(greatest(
    0::numeric,
    least(p_to_active_second, sa.end_active_second)
      - greatest(p_from_active_second, sa.at_active_second::numeric)
  )), 0::numeric)
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.cancelled_at is null
    and sa.end_active_second > p_from_active_second
    and sa.at_active_second < p_to_active_second;
$$;

-- 3. The projection every payload carries --------------------------------------

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
  v_bucket_start timestamptz;
  v_active numeric;
  v_active_second integer;
  v_counts jsonb;
  v_scheduled jsonb;
  v_next jsonb;
  v_photos jsonb;
begin
  v_bucket_start := to_timestamp(floor(extract(epoch from p_now) / 30) * 30);
  v_active := greatest(coalesce(p_global_active_seconds, 0), 0);
  v_active_second := floor(v_active)::integer;

  select jsonb_build_object(
    'wave', coalesce(max(case when rw.kind = 'wave' then rw.count end), 0),
    'water', coalesce(max(case when rw.kind = 'water' then rw.count end), 0),
    'photo', coalesce(max(case when rw.kind = 'photo' then rw.count end), 0)
  ) into v_counts
  from public.reaction_windows rw
  where rw.country_day_id = p_country_day_id and rw.bucket_start = v_bucket_start;

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

-- 4. The journey's own stops -----------------------------------------------------

create or replace function public.schedule_journey_activity(
  p_country_day_id uuid,
  p_occurrence_key text,
  p_kind text,
  p_source text,
  p_variant text,
  p_at_active_second integer,
  p_duration_seconds numeric,
  p_min_lead_seconds integer,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
)
returns table (
  out_scheduled boolean,
  out_reason text,
  out_at_active_second integer,
  out_end_active_second numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_projection record;
  v_active numeric;
  v_candidate integer;
  v_end numeric;
begin
  if p_source is null or p_source not in ('beat', 'system') then
    raise exception 'journey activities come from the schedule, never the crowd' using errcode = '22023';
  end if;
  if p_occurrence_key is null or p_kind is null
    or p_at_active_second is null or p_at_active_second < 0 then
    raise exception 'invalid journey activity' using errcode = '22023';
  end if;
  if p_duration_seconds is null or p_duration_seconds < 2 or p_duration_seconds > 90 then
    raise exception 'invalid activity duration' using errcode = '22023';
  end if;
  if p_min_lead_seconds is null or p_min_lead_seconds < 5 or p_min_lead_seconds > 120 then
    raise exception 'invalid activity lead' using errcode = '22023';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;

  -- The authority row lock serializes this with every heartbeat and reaction.
  perform 1
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;
  if not found then
    return query select false, 'no_runtime'::text, null::integer, null::numeric;
    return;
  end if;

  if exists (
    select 1 from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.occurrence_key = p_occurrence_key
      and sa.cancelled_at is null
  ) then
    return query select false, 'exists'::text, null::integer, null::numeric;
    return;
  end if;

  -- Never schedule behind what any viewer may already be showing.
  select * into v_projection from public.read_journey_runtime_v6(
    p_country_day_id, p_now, p_ttl_seconds, p_steps_per_second, p_pace_cap
  );
  v_active := greatest(coalesce(v_projection.out_global_active_seconds, 0), 0);
  if p_at_active_second < ceil(v_active) + p_min_lead_seconds then
    return query select false, 'too_soon'::text, null::integer, null::numeric;
    return;
  end if;

  v_candidate := p_at_active_second;
  while v_candidate <= p_at_active_second + 3 loop
    v_end := v_candidate + p_duration_seconds;
    if not exists (
      select 1 from public.scheduled_actions sa
      where sa.country_day_id = p_country_day_id
        and sa.at_active_second = v_candidate
    ) and not exists (
      select 1 from public.scheduled_actions sa
      where sa.country_day_id = p_country_day_id
        and sa.cancelled_at is null
        and sa.end_active_second > v_candidate
        and sa.at_active_second < v_end
    ) then
      begin
        insert into public.scheduled_actions (
          country_day_id, kind, at_active_second, end_active_second,
          frozen_distance_metres, source, variant, occurrence_key
        ) values (
          p_country_day_id, p_kind, v_candidate, v_end,
          null, p_source, p_variant, p_occurrence_key
        );
      exception when unique_violation then
        return query select false, 'exists'::text, null::integer, null::numeric;
        return;
      end;
      return query select true, 'scheduled'::text, v_candidate, v_end;
      return;
    end if;
    v_candidate := v_candidate + 1;
  end loop;

  return query select false, 'overlap'::text, null::integer, null::numeric;
end;
$$;

-- 5. Crowd reactions keep priority ----------------------------------------------

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.journey_runtime%rowtype;
  v_projection record;
  v_bucket_start timestamptz;
  v_count integer;
  v_watchers bigint;
  v_threshold integer;
  v_projected_active numeric;
  v_active_second integer;
  v_motion_kind text;
  v_duration numeric;
  v_candidate integer;
  v_blocked_until numeric;
  v_scheduled integer := null;
  v_frozen_distance double precision;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;

  v_bucket_start := to_timestamp(floor(extract(epoch from p_now) / 30) * 30);
  v_motion_kind := case p_kind when 'water' then 'drink' else p_kind::text end;
  v_duration := public.crowd_action_duration_seconds(v_motion_kind);

  if not public.consume_mutation_rate_limit(
    p_visitor_hash, 'reaction:' || p_kind::text, 1, 60, p_now
  ) then
    select coalesce(rw.count, 0) into v_count
    from public.reaction_windows rw
    where rw.country_day_id = p_country_day_id
      and rw.kind = p_kind
      and rw.bucket_start = v_bucket_start;

    select count(distinct pl.visitor_hash) into v_watchers
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visible
      and pl.scene_ready
      and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;

    return query select
      coalesce(v_count, 0),
      public.reaction_threshold(coalesce(v_watchers, 0)),
      null::integer,
      true;
    return;
  end if;

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  if not found then
    return query select 0, 2, null::integer, false;
    return;
  end if;

  -- Project the locked authority to request time, so an accepted reaction is
  -- never scheduled behind a solo viewer's bounded extrapolation (0035).
  select * into v_projection from public.read_journey_runtime_v6(
    p_country_day_id, p_now, p_ttl_seconds, 1.8, 5
  );

  select count(distinct pl.visitor_hash) into v_watchers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;

  v_threshold := public.reaction_threshold(coalesce(v_watchers, 0));
  v_projected_active := greatest(
    coalesce(v_projection.out_global_active_seconds, v_runtime.global_active_seconds), 0
  );
  v_active_second := floor(v_projected_active)::integer;

  insert into public.reaction_windows as rw (
    country_day_id, kind, bucket_start, count, updated_at
  ) values (p_country_day_id, p_kind, v_bucket_start, 1, p_now)
  on conflict (country_day_id, kind, bucket_start) do update set
    count = rw.count + 1,
    updated_at = p_now
  returning rw.count into v_count;

  -- The two-minute dedupe is about the crowd repeating itself; his own drink does
  -- not stop the crowd asking for water.
  if v_count >= v_threshold and not exists (
    select 1
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.source = 'crowd'
      and sa.kind = v_motion_kind
      and sa.at_active_second > v_active_second - 120
  ) then
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
          coalesce(v_projection.out_global_distance_metres, v_runtime.global_distance_metres)
            + greatest(
                0,
                v_candidate - v_projected_active - public.action_overlap_seconds(
                  p_country_day_id, v_projected_active, v_candidate
                )
              ) * 1.25 * coalesce(v_projection.out_pace_rate, v_runtime.pace_rate)
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

    if v_scheduled is not null then
      update public.reaction_windows rw
      set count = 0, updated_at = p_now
      where rw.country_day_id = p_country_day_id
        and rw.kind = p_kind
        and rw.bucket_start = v_bucket_start;
      v_count := 0;
    end if;
  end if;

  return query select v_count, v_threshold, v_scheduled, false;
end;
$$;

-- 6. Grants ----------------------------------------------------------------------

revoke all on function public.schedule_journey_activity(
  uuid, text, text, text, text, integer, numeric, integer, timestamptz, integer, numeric, real
) from public, anon, authenticated;
grant execute on function public.schedule_journey_activity(
  uuid, text, text, text, text, integer, numeric, integer, timestamptz, integer, numeric, real
) to service_role;

revoke all on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  to service_role;
revoke all on function public.read_day_reactions(uuid, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.read_day_reactions(uuid, timestamptz, numeric) to service_role;
revoke all on function public.action_overlap_seconds(uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.action_overlap_seconds(uuid, numeric, numeric) to service_role;
revoke all on function public.crowd_action_duration_seconds(text) from public, anon, authenticated;
grant execute on function public.crowd_action_duration_seconds(text) to service_role;
