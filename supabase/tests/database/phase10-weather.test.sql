begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000056', 'phase10-weather-test',
  'Phase 10 Weather Test', '2026-10-02T16:00:00Z', 1, 'preview',
  '2026-10-02T16:00:00Z', '2026-10-02T16:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000057',
  '00000000-0000-4000-8000-000000000056',
  1, 'GE', 'Georgia', 'Tbilisi', 'Asia/Tbilisi',
  '2026-10-02T16:00:00Z', '2026-10-03T16:00:00Z', 'tbilisi-v1', 'live'
);

insert into public.journey_runtime (
  country_day_id, last_accounted_at, active_viewers, global_active_seconds, global_steps
) values (
  '10000000-0000-4000-8000-000000000057', '2026-10-02T16:00:00Z', 0, 0, 0
);

-- Schema contract -----------------------------------------------------------

select has_column('public', 'journey_runtime', 'weather', 'the authority row caches the reading');
select has_function(
  'public', 'write_journey_weather',
  array['uuid', 'jsonb', 'timestamp with time zone'],
  'the server can store a reading'
);
select has_function(
  'public', 'read_journey_weather', array['uuid'],
  'the bootstrap can read the reading'
);
select has_function(
  'public', 'record_presence_heartbeat_v7',
  array[
    'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone',
    'integer', 'numeric', 'real', 'integer', 'text'
  ],
  'the heartbeat carries the weather'
);
select has_function(
  'public', 'read_bootstrap_bundle_v9',
  array[
    'text', 'timestamp with time zone', 'integer', 'numeric',
    'integer', 'integer', 'real'
  ],
  'the bootstrap bundle carries the weather'
);

-- Grants --------------------------------------------------------------------

select is(
  has_function_privilege('anon', 'public.write_journey_weather(uuid,jsonb,timestamptz)', 'EXECUTE'),
  false,
  'anon cannot write weather'
);
select is(
  has_function_privilege('authenticated', 'public.read_journey_weather(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot read weather directly'
);
select is(
  has_function_privilege('service_role', 'public.write_journey_weather(uuid,jsonb,timestamptz)', 'EXECUTE'),
  true,
  'service_role writes the reading it fetched'
);

-- Behaviour -----------------------------------------------------------------

select is(
  public.read_journey_weather('10000000-0000-4000-8000-000000000057'),
  null,
  'no reading is invented before one is fetched'
);

select is(
  public.write_journey_weather(
    '10000000-0000-4000-8000-000000000057',
    '{"code":61,"tempC":13.4,"windKmh":9,"isDay":true,"fetchedAt":"2026-10-02T16:05:00Z"}'::jsonb,
    '2026-10-02T16:05:00Z'
  ),
  true,
  'the first reading is stored'
);
select is(
  public.read_journey_weather('10000000-0000-4000-8000-000000000057') ->> 'code',
  '61',
  'the stored reading is readable'
);

-- A slower request that started earlier must not overwrite a fresher reading.
select is(
  public.write_journey_weather(
    '10000000-0000-4000-8000-000000000057',
    '{"code":0,"tempC":20,"windKmh":1,"isDay":true,"fetchedAt":"2026-10-02T16:04:00Z"}'::jsonb,
    '2026-10-02T16:06:00Z'
  ),
  false,
  'a stale reading never overwrites a fresher one'
);
select is(
  public.read_journey_weather('10000000-0000-4000-8000-000000000057') ->> 'code',
  '61',
  'the fresher reading survives the late arrival'
);

select is(
  public.write_journey_weather(
    '10000000-0000-4000-8000-000000000057',
    '{"code":71,"tempC":-2,"windKmh":18,"isDay":false,"fetchedAt":"2026-10-02T16:15:00Z"}'::jsonb,
    '2026-10-02T16:15:00Z'
  ),
  true,
  'a newer reading replaces the cached one'
);

select is(
  public.write_journey_weather(
    '10000000-0000-4000-8000-000000000057',
    '{"code":0,"tempC":20}'::jsonb,
    '2026-10-02T16:20:00Z'
  ),
  false,
  'a reading without a timestamp is refused'
);

select * from finish();
rollback;
