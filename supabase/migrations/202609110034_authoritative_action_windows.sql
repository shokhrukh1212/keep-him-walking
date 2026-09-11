-- Crowd actions now own watched-second windows and stop route distance inside
-- those windows. v11/v5 remain rollback contracts; the app moves to v12/v6.

create or replace function public.crowd_action_duration_seconds(p_kind text)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_kind
    when 'wave' then 2.5
    when 'drink' then 5.5
    when 'photo' then 4.0
    else null
  end;
$$;

alter table public.scheduled_actions
  add column end_active_second numeric(18,3),
  add column frozen_distance_metres double precision;

update public.scheduled_actions sa
set end_active_second = sa.at_active_second + public.crowd_action_duration_seconds(sa.kind)
where sa.end_active_second is null;

alter table public.scheduled_actions
  alter column end_active_second set not null,
  add constraint scheduled_actions_window_check
    check (end_active_second > at_active_second),
  add constraint scheduled_actions_frozen_distance_check
    check (frozen_distance_metres is null or frozen_distance_metres >= 0);

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
    and sa.end_active_second > p_from_active_second
    and sa.at_active_second < p_to_active_second;
$$;

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
  v_bucket_start timestamptz;
  v_count integer;
  v_watchers bigint;
  v_threshold integer;
  v_active_second integer;
  v_motion_kind text;
  v_duration numeric;
  v_candidate integer;
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

  select count(distinct pl.visitor_hash) into v_watchers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;

  v_threshold := public.reaction_threshold(coalesce(v_watchers, 0));
  v_active_second := floor(v_runtime.global_active_seconds)::integer;

  insert into public.reaction_windows as rw (
    country_day_id, kind, bucket_start, count, updated_at
  ) values (p_country_day_id, p_kind, v_bucket_start, 1, p_now)
  on conflict (country_day_id, kind, bucket_start) do update set
    count = rw.count + 1,
    updated_at = p_now
  returning rw.count into v_count;

  if v_count >= v_threshold and not exists (
    select 1
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.kind = v_motion_kind
      and sa.at_active_second > v_active_second - 120
  ) then
    v_candidate := v_active_second + 2;
    while v_candidate <= v_active_second + 6 and v_scheduled is null loop
      if not exists (
        select 1 from public.scheduled_actions sa
        where sa.country_day_id = p_country_day_id
          and sa.end_active_second > v_candidate
          and sa.at_active_second < v_candidate + v_duration
      ) then
        v_frozen_distance := greatest(
          0,
          v_runtime.global_distance_metres
            + greatest(
                0,
                v_candidate - v_runtime.global_active_seconds
                  - public.action_overlap_seconds(
                      p_country_day_id, v_runtime.global_active_seconds, v_candidate
                    )
              ) * 1.25 * v_runtime.pace_rate
        );
        insert into public.scheduled_actions (
          country_day_id, kind, at_active_second, end_active_second,
          frozen_distance_metres, source
        ) values (
          p_country_day_id, v_motion_kind, v_candidate,
          v_candidate + v_duration, v_frozen_distance, 'crowd'
        )
        on conflict (country_day_id, at_active_second) do nothing;
        if found then v_scheduled := v_candidate; end if;
      end if;
      v_candidate := v_candidate + 1;
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
  v_active_second integer;
  v_counts jsonb;
  v_scheduled jsonb;
  v_next jsonb;
  v_photos jsonb;
begin
  v_bucket_start := to_timestamp(floor(extract(epoch from p_now) / 30) * 30);
  v_active_second := floor(greatest(coalesce(p_global_active_seconds, 0), 0))::integer;

  select jsonb_build_object(
    'wave', coalesce(max(case when rw.kind = 'wave' then rw.count end), 0),
    'water', coalesce(max(case when rw.kind = 'water' then rw.count end), 0),
    'photo', coalesce(max(case when rw.kind = 'photo' then rw.count end), 0)
  ) into v_counts
  from public.reaction_windows rw
  where rw.country_day_id = p_country_day_id and rw.bucket_start = v_bucket_start;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', rows.kind,
      'atActiveSecond', rows.at_active_second,
      'endsAtActiveSecond', rows.end_active_second,
      'frozenDistanceMetres', rows.frozen_distance_metres
    ) order by rows.at_active_second
  ), '[]'::jsonb) into v_scheduled
  from (
    select sa.kind, sa.at_active_second, sa.end_active_second, sa.frozen_distance_metres
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.end_active_second > v_active_second - 180
    order by sa.at_active_second desc limit 8
  ) rows;

  select jsonb_build_object(
    'kind', sa.kind,
    'atActiveSecond', sa.at_active_second,
    'endsAtActiveSecond', sa.end_active_second,
    'frozenDistanceMetres', sa.frozen_distance_metres
  ) into v_next
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.end_active_second >= v_active_second
  order by sa.at_active_second limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'atActiveSecond', rows.at_active_second, 'storagePath', rows.storage_path
  ) order by rows.at_active_second desc), '[]'::jsonb) into v_photos
  from (
    select dp.at_active_second, dp.storage_path from public.day_photos dp
    where dp.country_day_id = p_country_day_id
    order by dp.at_active_second desc limit 6
  ) rows;

  return jsonb_build_object(
    'counts', coalesce(v_counts, jsonb_build_object('wave', 0, 'water', 0, 'photo', 0)),
    'scheduled', v_scheduled,
    'nextScheduledAction', v_next,
    'photos', v_photos
  );
end;
$$;

create or replace function public.record_presence_heartbeat_v12(
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
  out_country_code char(2),
  out_reactions jsonb,
  out_weather jsonb,
  out_hundred_watchers_at timestamptz,
  out_heartbeat_seconds integer,
  out_lease_ttl_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_before_active numeric := 0;
  v_before_distance double precision := 0;
  v_active_delta numeric;
  v_distance_delta double precision;
  v_overlap numeric;
  v_distance double precision;
begin
  select jr.global_active_seconds, jr.global_distance_metres
    into v_before_active, v_before_distance
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  select * into v_result from public.record_presence_heartbeat_v11(
    p_country_day_id, p_visitor_hash, p_session_hash, p_state, p_scene_ready,
    p_now, p_ttl_seconds, p_steps_per_second, p_pace_cap,
    p_first_watcher_gap_seconds, p_country_code
  );

  v_before_active := coalesce(v_before_active, 0);
  v_before_distance := coalesce(v_before_distance, 0);
  v_active_delta := greatest(v_result.out_global_active_seconds - v_before_active, 0);
  v_distance_delta := greatest(v_result.out_global_distance_metres - v_before_distance, 0);
  v_overlap := public.action_overlap_seconds(
    p_country_day_id, v_before_active, v_result.out_global_active_seconds
  );
  v_distance := case when v_active_delta > 0
    then v_result.out_global_distance_metres
      - v_distance_delta * least(1, v_overlap / v_active_delta)
    else v_result.out_global_distance_metres end;

  update public.journey_runtime jr
  set global_distance_metres = greatest(v_distance, v_before_distance)
  where jr.country_day_id = p_country_day_id;
  v_distance := greatest(v_distance, v_before_distance);

  return query select
    v_result.out_active_viewers, v_result.out_global_steps,
    v_result.out_visitor_active_seconds, v_result.out_accounted_at,
    v_result.out_global_active_seconds, v_distance, v_result.out_pace_rate,
    v_result.out_waiting_since, v_result.out_woke_him, v_result.out_country_code,
    public.read_day_reactions(
      p_country_day_id, v_result.out_accounted_at, v_result.out_global_active_seconds
    ),
    v_result.out_weather, v_result.out_hundred_watchers_at,
    v_result.out_heartbeat_seconds, v_result.out_lease_ttl_seconds;
end;
$$;

create or replace function public.read_journey_runtime_v6(
  p_country_day_id uuid,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
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
  out_last_watcher_left_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_stored_active numeric := 0;
  v_stored_distance double precision := 0;
  v_active_delta numeric;
  v_distance_delta double precision;
  v_overlap numeric;
  v_distance double precision;
begin
  select jr.global_active_seconds, jr.global_distance_metres
    into v_stored_active, v_stored_distance
  from public.journey_runtime jr where jr.country_day_id = p_country_day_id;

  select * into v_result from public.read_journey_runtime_v5(
    p_country_day_id, p_now, p_ttl_seconds, p_steps_per_second, p_pace_cap
  );
  v_stored_active := coalesce(v_stored_active, 0);
  v_stored_distance := coalesce(v_stored_distance, 0);
  v_active_delta := greatest(v_result.out_global_active_seconds - v_stored_active, 0);
  v_distance_delta := greatest(v_result.out_global_distance_metres - v_stored_distance, 0);
  v_overlap := public.action_overlap_seconds(
    p_country_day_id, v_stored_active, v_result.out_global_active_seconds
  );
  v_distance := case when v_active_delta > 0
    then v_result.out_global_distance_metres
      - v_distance_delta * least(1, v_overlap / v_active_delta)
    else v_result.out_global_distance_metres end;

  return query select
    v_result.out_active_viewers, v_result.out_global_steps,
    v_result.out_visitor_active_seconds, v_result.out_accounted_at,
    v_result.out_global_active_seconds, greatest(v_distance, v_stored_distance),
    v_result.out_pace_rate, v_result.out_waiting_since,
    v_result.out_last_watcher_left_at;
end;
$$;

create or replace function public.read_bootstrap_bundle_v14(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_pace_cap real,
  p_collect_seconds numeric
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
  v_runtime record;
begin
  v_result := public.read_bootstrap_bundle_v13(
    p_visitor_hash, p_real_now, p_ttl_seconds, p_steps_per_second,
    p_rate_limit, p_rate_window_seconds, p_pace_cap, p_collect_seconds
  );
  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then return v_result; end if;

  v_bundle := v_result -> 'bundle';
  v_country_day_id := nullif(v_bundle #>> '{country_day,id}', '')::uuid;
  select * into v_runtime from public.read_journey_runtime_v6(
    v_country_day_id, p_real_now, p_ttl_seconds, p_steps_per_second, p_pace_cap
  );
  v_bundle := jsonb_set(v_bundle, '{runtime}', to_jsonb(v_runtime), true);
  v_bundle := jsonb_set(v_bundle, '{reactions}', public.read_day_reactions(
    v_country_day_id, p_real_now, v_runtime.out_global_active_seconds
  ), true);
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.crowd_action_duration_seconds(text) from public, anon, authenticated;
revoke all on function public.action_overlap_seconds(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v12(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.read_journey_runtime_v6(uuid, timestamptz, integer, numeric, real)
  from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v14(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) from public, anon, authenticated;

grant execute on function public.crowd_action_duration_seconds(text) to service_role;
grant execute on function public.action_overlap_seconds(uuid, numeric, numeric) to service_role;
grant execute on function public.record_presence_heartbeat_v12(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.read_journey_runtime_v6(uuid, timestamptz, integer, numeric, real)
  to service_role;
grant execute on function public.read_bootstrap_bundle_v14(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) to service_role;
