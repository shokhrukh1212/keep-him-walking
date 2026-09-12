-- Launch correction: project the locked watched-time authority before scheduling
-- a reaction, and preserve exact cents for Premium. Existing purchase snapshots
-- are immutable and are not rewritten.

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

  -- The prior implementation scheduled from the last stored heartbeat. A solo
  -- viewer could already have extrapolated beyond that second and never render
  -- the accepted Wave. Project from the locked authority to this request time.
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
  v_active_second := floor(greatest(
    coalesce(v_projection.out_global_active_seconds, v_runtime.global_active_seconds), 0
  ))::integer;

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
          coalesce(v_projection.out_global_distance_metres, v_runtime.global_distance_metres)
            + greatest(
                0,
                v_candidate - coalesce(
                  v_projection.out_global_active_seconds,
                  v_runtime.global_active_seconds
                ) - public.action_overlap_seconds(
                  p_country_day_id,
                  coalesce(v_projection.out_global_active_seconds, v_runtime.global_active_seconds),
                  v_candidate
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
      then greatest(100, round(p_price_cents * p_premium_multiplier))::integer
    else p_price_cents
  end;
$$;

revoke all on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  to service_role;
