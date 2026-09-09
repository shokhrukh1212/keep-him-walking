begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000086', 'phase7-countries-test',
  'Phase 7 Countries Test', '2026-09-20T00:00:00Z', 2, 'preview',
  '2026-09-20T00:00:00Z', '2026-09-20T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  (
    '10000000-0000-4000-8000-000000000087',
    '00000000-0000-4000-8000-000000000086',
    1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
    '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z', 'tashkent-v4', 'live'
  ),
  (
    '10000000-0000-4000-8000-000000000088',
    '00000000-0000-4000-8000-000000000086',
    2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
    '2026-09-21T00:00:00Z', '2026-09-22T00:00:00Z', 'dushanbe-v1', 'scheduled'
  );

-- Schema contract -----------------------------------------------------------

select has_column(
  'public', 'presence_leases', 'country_code',
  'a lease carries the edge-derived country and never an address'
);
select has_table(
  'public', 'country_day_watch',
  'the per-day country aggregate exists'
);
select has_column(
  'public', 'country_day_watch', 'watch_seconds',
  'the aggregate carries confirmed watch seconds'
);
select has_column(
  'public', 'country_day_watch', 'peak_watchers',
  'the aggregate carries the per-country peak'
);
select hasnt_column(
  'public', 'presence_leases', 'ip_address',
  'no address column was introduced by the country feature'
);

select has_function(
  'public',
  'record_presence_heartbeat_v5',
  array[
    'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone',
    'integer', 'numeric', 'real', 'integer', 'text'
  ],
  'the country heartbeat accepts an edge country code'
);
select has_function(
  'public',
  'read_country_day_watch',
  array['uuid', 'timestamp with time zone', 'integer'],
  'the country projection exists'
);
select has_function(
  'public',
  'read_bootstrap_bundle_v6',
  array[
    'text', 'timestamp with time zone', 'integer', 'numeric',
    'integer', 'integer', 'real'
  ],
  'the bootstrap bundle carries countries'
);

-- Grants --------------------------------------------------------------------

select is(
  has_function_privilege(
    'anon',
    'public.record_presence_heartbeat_v5(uuid,text,text,text,boolean,timestamptz,integer,numeric,real,integer,text)',
    'EXECUTE'
  ),
  false,
  'anon cannot call the country heartbeat'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.read_country_day_watch(uuid,timestamptz,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot read the country projection directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_presence_heartbeat_v5(uuid,text,text,text,boolean,timestamptz,integer,numeric,real,integer,text)',
    'EXECUTE'
  ),
  true,
  'service_role calls the country heartbeat'
);
select is(
  has_function_privilege(
    'service_role',
    'public.read_bootstrap_bundle_v6(text,timestamptz,integer,numeric,integer,integer,real)',
    'EXECUTE'
  ),
  true,
  'service_role reads the country bundle'
);

-- Header normalization ------------------------------------------------------

select is(public.normalize_country_code('ge'), 'GE'::char(2), 'a lowercase header is stored uppercase');
select is(public.normalize_country_code(null), 'ZZ'::char(2), 'an absent header is the unknown country');
select is(public.normalize_country_code('GEO'), 'ZZ'::char(2), 'a malformed header is the unknown country');

-- Aggregation ---------------------------------------------------------------

-- First heartbeat from Georgia establishes the lease; it has carried no time yet.
do $$ begin perform * from public.record_presence_heartbeat_v5(
  '10000000-0000-4000-8000-000000000087', repeat('a', 64), repeat('1', 64),
  'active', true, '2026-09-20T00:00:00Z', 50, 1.8, 5, 600, 'GE'
); end; $$;

select is(
  (select country_code from public.presence_leases
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and session_hash = repeat('1', 64)),
  'GE'::char(2),
  'the lease stores the caller country'
);

-- Twenty seconds later the same visitor has carried twenty seconds for Georgia.
do $$ begin perform * from public.record_presence_heartbeat_v5(
  '10000000-0000-4000-8000-000000000087', repeat('a', 64), repeat('1', 64),
  'active', true, '2026-09-20T00:00:20Z', 50, 1.8, 5, 600, 'GE'
); end; $$;

select is(
  (select watch_seconds from public.country_day_watch
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and country_code = 'GE'),
  20,
  'Georgia is credited only its own visible delta'
);

-- A second visitor from Uzbekistan accrues into its own row.
do $$ begin perform * from public.record_presence_heartbeat_v5(
  '10000000-0000-4000-8000-000000000087', repeat('b', 64), repeat('2', 64),
  'active', true, '2026-09-20T00:00:20Z', 50, 1.8, 5, 600, 'uz'
); end; $$;
do $$ begin perform * from public.record_presence_heartbeat_v5(
  '10000000-0000-4000-8000-000000000087', repeat('b', 64), repeat('2', 64),
  'active', true, '2026-09-20T00:00:30Z', 50, 1.8, 5, 600, 'uz'
); end; $$;

select is(
  (select watch_seconds from public.country_day_watch
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and country_code = 'UZ'),
  10,
  'each country accrues only its own watchers'
);
select is(
  (select watch_seconds from public.country_day_watch
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and country_code = 'GE'),
  20,
  'one country never absorbs another country time'
);
select is(
  (select peak_watchers from public.country_day_watch
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and country_code = 'UZ'),
  1,
  'the per-country peak counts distinct visitors'
);

-- An unknown-country visitor is stored as ZZ rather than dropped.
do $$ begin perform * from public.record_presence_heartbeat_v5(
  '10000000-0000-4000-8000-000000000087', repeat('c', 64), repeat('3', 64),
  'active', true, '2026-09-20T00:00:30Z', 50, 1.8, 5, 600, null
); end; $$;

select is(
  (select country_code from public.presence_leases
   where country_day_id = '10000000-0000-4000-8000-000000000087'
     and session_hash = repeat('3', 64)),
  'ZZ'::char(2),
  'an unknown country is stored explicitly'
);

select is(
  jsonb_array_length(
    public.read_country_day_watch(
      '10000000-0000-4000-8000-000000000087', '2026-09-20T00:00:30Z', 50
    ) -> 'live'
  ),
  3,
  'the live projection lists every country currently holding a lease'
);
select is(
  public.read_country_day_watch(
    '10000000-0000-4000-8000-000000000087', '2026-09-20T00:00:30Z', 50
  ) #>> '{top,0,code}',
  'GE',
  'the day leaderboard ranks by carried time'
);
select is(
  jsonb_array_length(
    public.read_country_day_watch(
      '10000000-0000-4000-8000-000000000087', '2026-09-20T02:00:00Z', 50
    ) -> 'live'
  ),
  0,
  'expired leases leave the live projection'
);

select * from finish();
rollback;
