-- P13: immutable day outcomes, exact audience peaks, and recap storage.
-- v7 heartbeat and the one-argument reconciliation remain rollback contracts.

alter table public.journey_runtime
  add column peak_active_viewers integer not null default 0
    check (peak_active_viewers >= 0);

update public.journey_runtime jr
set peak_active_viewers = greatest(
  jr.active_viewers,
  coalesce((
    select max(sb.active_viewers)
    from public.step_buckets sb
    where sb.country_day_id = jr.country_day_id
  ), 0)
);

alter table public.day_outcomes
  add column top_countries jsonb not null default '[]'::jsonb,
  add constraint day_outcomes_top_countries_array
    check (jsonb_typeof(top_countries) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('khw-recaps', 'khw-recaps', true, 5242880, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public recap reads"
on storage.objects for select to anon, authenticated
using (bucket_id = 'khw-recaps');

create or replace function public.record_presence_heartbeat_v8(
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
  out_weather jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
begin
  -- v7 takes the journey_runtime row lock through the heartbeat chain. The peak
  -- update is therefore ordered with the exact live count returned to callers.
  select * into v_result
  from public.record_presence_heartbeat_v7(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap,
    p_first_watcher_gap_seconds,
    p_country_code
  );

  update public.journey_runtime jr
  set peak_active_viewers = greatest(
    jr.peak_active_viewers,
    coalesce(v_result.out_active_viewers, 0)::integer
  )
  where jr.country_day_id = p_country_day_id;

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
    v_result.out_country_code,
    v_result.out_reactions,
    v_result.out_weather;
end;
$$;

create or replace function public.finalize_day_outcome(
  p_country_day_id uuid,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
)
returns public.day_outcomes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.country_days%rowtype;
  v_runtime public.journey_runtime%rowtype;
  v_projection record;
  v_distance double precision := 0;
  v_peak integer := 0;
  v_unique integer := 0;
  v_countries integer := 0;
  v_top_country char(2);
  v_top_countries jsonb := '[]'::jsonb;
  v_outcome public.day_outcomes%rowtype;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300
    or p_steps_per_second <= 0
    or p_pace_cap < 1 or p_pace_cap > 5 then
    raise exception 'invalid outcome runtime configuration' using errcode = '22023';
  end if;

  select * into v_day
  from public.country_days cd
  where cd.id = p_country_day_id;

  if not found or v_day.ends_at > public.journey_story_now(v_day.journey_id, p_real_now) then
    raise exception 'country-day has not ended' using errcode = '22023';
  end if;

  -- All authority for the ending day is frozen while the last lease projection
  -- and immutable outcome are calculated.
  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  select * into v_projection
  from public.read_journey_runtime_v5(
    p_country_day_id,
    v_day.ends_at,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap
  );

  v_distance := greatest(0, coalesce(v_projection.out_global_distance_metres, 0));
  v_peak := greatest(
    coalesce(v_runtime.peak_active_viewers, 0),
    coalesce(v_runtime.active_viewers, 0),
    coalesce((
      select max(sb.active_viewers)
      from public.step_buckets sb
      where sb.country_day_id = p_country_day_id
    ), 0)
  );

  select count(*)::integer into v_unique
  from public.visitor_day_contributions vdc
  where vdc.country_day_id = p_country_day_id
    and vdc.active_seconds > 0;

  select count(*)::integer into v_countries
  from public.country_day_watch cdw
  where cdw.country_day_id = p_country_day_id
    and cdw.country_code <> 'ZZ'
    and cdw.watch_seconds > 0;

  select ranked.country_code into v_top_country
  from public.country_day_watch ranked
  where ranked.country_day_id = p_country_day_id
    and ranked.country_code <> 'ZZ'
    and ranked.watch_seconds > 0
  order by ranked.watch_seconds desc, ranked.country_code
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', ranked.country_code,
      'watchSeconds', ranked.watch_seconds,
      'rank', ranked.rank
    ) order by ranked.rank
  ), '[]'::jsonb)
  into v_top_countries
  from (
    select cdw.country_code, cdw.watch_seconds,
      row_number() over (order by cdw.watch_seconds desc, cdw.country_code)::integer as rank
    from public.country_day_watch cdw
    where cdw.country_day_id = p_country_day_id
      and cdw.country_code <> 'ZZ'
      and cdw.watch_seconds > 0
    order by cdw.watch_seconds desc, cdw.country_code
    limit 5
  ) ranked;

  insert into public.day_outcomes (
    country_day_id,
    distance_metres,
    landmark_reached,
    marathon,
    peak_watchers,
    unique_watchers,
    countries_count,
    top_country,
    top_countries,
    computed_at
  ) values (
    p_country_day_id,
    v_distance,
    v_distance >= 8000,
    v_distance >= 42195,
    v_peak,
    v_unique,
    v_countries,
    v_top_country,
    v_top_countries,
    p_real_now
  )
  on conflict (country_day_id) do nothing;

  select * into v_outcome
  from public.day_outcomes outcomes
  where outcomes.country_day_id = p_country_day_id;

  return v_outcome;
end;
$$;

create or replace function public.reconcile_phase2_state_v2(
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_story_now timestamptz;
  v_day record;
  v_state jsonb;
  v_finalized integer := 0;
  v_recap_days jsonb := '[]'::jsonb;
begin
  select * into v_journey
  from public.journeys journeys
  where journeys.phase2_enabled and journeys.status in ('preview', 'active')
  order by journeys.starts_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'state', 'inactive',
      'changed', 0,
      'finalizedOutcomes', 0,
      'recapDays', '[]'::jsonb
    );
  end if;

  v_story_now := public.journey_story_now(v_journey.id, p_real_now);
  for v_day in
    select cd.id
    from public.country_days cd
    where cd.journey_id = v_journey.id
      and cd.ends_at <= v_story_now
      and not exists (
        select 1 from public.day_outcomes outcomes
        where outcomes.country_day_id = cd.id
      )
    order by cd.day_number
    for update
  loop
    perform public.finalize_day_outcome(
      v_day.id,
      p_real_now,
      p_ttl_seconds,
      p_steps_per_second,
      p_pace_cap
    );
    v_finalized := v_finalized + 1;
  end loop;

  -- The original reconciliation remains the single owner of day and sponsor
  -- status transitions. This transaction already holds the journey row lock.
  v_state := public.reconcile_phase2_state(p_real_now);

  select coalesce(jsonb_agg(
    jsonb_build_object('countryDayId', recap.id, 'dayNumber', recap.day_number)
    order by recap.day_number
  ), '[]'::jsonb)
  into v_recap_days
  from (
    select cd.id, cd.day_number
    from public.country_days cd
    join public.day_outcomes outcomes on outcomes.country_day_id = cd.id
    where cd.journey_id = v_journey.id
      and cd.ends_at <= v_story_now
      and outcomes.recap_image_path is null
    order by cd.day_number
  ) recap;

  return v_state || jsonb_build_object(
    'finalizedOutcomes', v_finalized,
    'recapDays', v_recap_days
  );
end;
$$;

revoke all on function public.record_presence_heartbeat_v8(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.finalize_day_outcome(
  uuid, timestamptz, integer, numeric, real
) from public, anon, authenticated;
revoke all on function public.reconcile_phase2_state_v2(
  timestamptz, integer, numeric, real
) from public, anon, authenticated;

grant execute on function public.record_presence_heartbeat_v8(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.finalize_day_outcome(
  uuid, timestamptz, integer, numeric, real
) to service_role;
grant execute on function public.reconcile_phase2_state_v2(
  timestamptz, integer, numeric, real
) to service_role;
