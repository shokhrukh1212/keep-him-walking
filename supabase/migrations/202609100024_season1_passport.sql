-- P16: the passport becomes a server-confirmed fact.
--
-- Until now "collected" lived in localStorage, so it survived nothing and proved
-- nothing. The visitor's own contribution row is the only honest source: he was
-- present for a day if he watched it for at least the collect threshold.
--
-- Streaks run on `day_number` inside one journey, never on calendar dates. A
-- rollover that lands late must not break a streak that the visitor actually kept.
--
-- `season_number` gives the "Season 1" label something to stand on, so /season/[n]
-- can 404 honestly instead of rendering a season nobody ran.

alter table public.journeys
  add column season_number integer not null default 1 check (season_number > 0);

create index journeys_season_idx on public.journeys (season_number);

create or replace function public.read_visitor_passport(
  p_journey_id uuid,
  p_visitor_hash text,
  p_collect_seconds numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days jsonb;
  v_streak integer := 0;
  v_previous integer := null;
  v_row record;
begin
  if p_journey_id is null then
    return jsonb_build_object('days', '[]'::jsonb, 'streak', 0);
  end if;

  -- One row per day the public can already see. `collected` is the visitor's own
  -- contribution measured against the threshold; a day with no row is not collected.
  select coalesce(jsonb_agg(day_row order by day_number), '[]'::jsonb)
  into v_days
  from (
    select
      cd.day_number,
      jsonb_build_object(
        'dayNumber', cd.day_number,
        'countryDayId', cd.id,
        'collected', coalesce(c.active_seconds, 0) >= p_collect_seconds
      ) as day_row
    from public.country_days cd
    left join public.visitor_day_contributions c
      on c.country_day_id = cd.id
     and c.visitor_hash = p_visitor_hash
    where cd.journey_id = p_journey_id
      and cd.status in ('completed', 'live')
  ) ordered;

  -- The streak is the run of consecutive day numbers ending at the most recent
  -- collected day, walked newest-first so the first gap ends the count.
  for v_row in
    select cd.day_number
    from public.country_days cd
    join public.visitor_day_contributions c
      on c.country_day_id = cd.id
     and c.visitor_hash = p_visitor_hash
    where cd.journey_id = p_journey_id
      and cd.status in ('completed', 'live')
      and c.active_seconds >= p_collect_seconds
    order by cd.day_number desc
  loop
    if v_previous is null or v_previous = v_row.day_number + 1 then
      v_streak := v_streak + 1;
      v_previous := v_row.day_number;
    else
      exit;
    end if;
  end loop;

  return jsonb_build_object('days', v_days, 'streak', v_streak);
end;
$$;

revoke all on function public.read_visitor_passport(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.read_visitor_passport(uuid, text, numeric)
  to service_role;

-- The bundle gains the two passport facts the HUD can show without a second round
-- trip. v10 remains the rollback contract.
create or replace function public.read_bootstrap_bundle_v11(
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
  v_journey_id uuid;
  v_passport jsonb;
begin
  v_result := public.read_bootstrap_bundle_v10(
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
  v_country_day_id := nullif(v_bundle #>> '{country_day,id}', '')::uuid;

  select cd.journey_id into v_journey_id
  from public.country_days cd
  where cd.id = v_country_day_id;

  v_passport := public.read_visitor_passport(v_journey_id, p_visitor_hash, p_collect_seconds);

  v_bundle := jsonb_set(
    v_bundle,
    '{passport}',
    jsonb_build_object(
      'streak', coalesce((v_passport ->> 'streak')::integer, 0),
      'collectedToday', coalesce((
        select (d ->> 'collected')::boolean
        from jsonb_array_elements(v_passport -> 'days') d
        where nullif(d ->> 'countryDayId', '')::uuid = v_country_day_id
      ), false)
    ),
    true
  );

  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.read_bootstrap_bundle_v11(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) from public, anon, authenticated;
grant execute on function public.read_bootstrap_bundle_v11(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) to service_role;
