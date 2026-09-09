begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000076', 'phase8-reactions-test',
  'Phase 8 Reactions Test', '2026-09-24T00:00:00Z', 1, 'preview',
  '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000077',
  '00000000-0000-4000-8000-000000000076',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-24T00:00:00Z', '2026-09-25T00:00:00Z', 'tashkent-v4', 'live'
);

-- Schema contract -----------------------------------------------------------

select has_type('public', 'reaction_kind', 'reactions are a closed enum');
select has_table('public', 'reaction_windows', 'reaction buckets exist');
select has_table('public', 'scheduled_actions', 'crowd actions are recorded');
select has_table('public', 'day_photos', 'day photographs are recorded');
select col_is_pk(
  'public', 'reaction_windows',
  array['country_day_id', 'kind', 'bucket_start'],
  'one bucket per kind per thirty seconds'
);
select is(
  (select count(*) from pg_constraint
   where conrelid = 'public.scheduled_actions'::regclass and contype = 'u'),
  1::bigint,
  'one crowd action per active second per day'
);

select has_function(
  'public', 'submit_reaction',
  array['uuid', 'text', 'reaction_kind', 'timestamp with time zone', 'integer'],
  'the reaction RPC exists'
);
select has_function(
  'public', 'read_day_reactions',
  array['uuid', 'timestamp with time zone', 'numeric'],
  'the reaction projection exists'
);
select has_function(
  'public', 'record_presence_heartbeat_v6',
  array[
    'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone',
    'integer', 'numeric', 'real', 'integer', 'text'
  ],
  'the heartbeat carries reactions'
);

-- Grants --------------------------------------------------------------------

select is(
  has_function_privilege(
    'anon',
    'public.submit_reaction(uuid,text,public.reaction_kind,timestamptz,integer)',
    'EXECUTE'
  ),
  false,
  'anon cannot submit reactions directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.submit_reaction(uuid,text,public.reaction_kind,timestamptz,integer)',
    'EXECUTE'
  ),
  true,
  'service_role submits reactions on behalf of a visitor'
);
select is(
  has_table_privilege('anon', 'public.scheduled_actions', 'SELECT'),
  false,
  'anon cannot read scheduled actions directly'
);

-- Threshold table -----------------------------------------------------------

select is(public.reaction_threshold(0), 2, 'an empty room still needs two people');
select is(public.reaction_threshold(6), 2, 'six watchers still need two');
select is(public.reaction_threshold(7), 3, 'seven watchers need three');
select is(public.reaction_threshold(100), 30, 'a hundred watchers need thirty');

-- Behaviour -----------------------------------------------------------------

-- Four visitors watching, so the threshold is two.
do $$
declare
  v_index integer;
begin
  for v_index in 1..4 loop
    perform * from public.record_presence_heartbeat_v6(
      '10000000-0000-4000-8000-000000000077',
      repeat(chr(96 + v_index), 64), repeat(v_index::text, 64),
      'active', true, '2026-09-24T00:10:00Z', 50, 1.8, 5, 600, 'UZ'
    );
  end loop;
end; $$;

-- The first wave counts but does not reach the threshold of two.
create temporary table first_wave as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000077', repeat('a', 64), 'wave',
  '2026-09-24T00:10:01Z', 50
);

select is((select out_count from first_wave), 1, 'the first wave is counted');
select is((select out_threshold from first_wave), 2, 'the threshold follows the live crowd');
select is((select out_scheduled_at from first_wave), null, 'one person is not a crowd');

-- A different visitor in the same 30-second bucket reaches the threshold.
create temporary table second_wave as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000077', repeat('b', 64), 'wave',
  '2026-09-24T00:10:02Z', 50
);

select isnt((select out_scheduled_at from second_wave), null, 'the crowd schedules a wave');
select is((select out_count from second_wave), 0, 'the bucket resets after he acts');
select is(
  (select kind from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000077'),
  'wave',
  'the scheduled action is the motion kind, not the reaction enum'
);

-- The same visitor may not send the same kind again within the minute.
create temporary table repeat_wave as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000077', repeat('a', 64), 'wave',
  '2026-09-24T00:10:20Z', 50
);

select is((select out_rate_limited from repeat_wave), true, 'one wave per visitor per minute');

-- Two more visitors wave inside the 120 active-second dedupe window. The bucket
-- still counts them, but he does not wave twice in the same two minutes.
do $$ begin
  perform * from public.submit_reaction(
    '10000000-0000-4000-8000-000000000077', repeat('c', 64), 'wave',
    '2026-09-24T00:10:35Z', 50);
  perform * from public.submit_reaction(
    '10000000-0000-4000-8000-000000000077', repeat('d', 64), 'wave',
    '2026-09-24T00:10:36Z', 50);
end; $$;

select is(
  (select count(*) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000077' and kind = 'wave'),
  1::bigint,
  'a second wave inside 120 active seconds is refused'
);

-- A different kind is unaffected by the wave dedupe.
do $$ begin
  perform * from public.submit_reaction(
    '10000000-0000-4000-8000-000000000077', repeat('c', 64), 'water',
    '2026-09-24T00:10:40Z', 50);
  perform * from public.submit_reaction(
    '10000000-0000-4000-8000-000000000077', repeat('d', 64), 'water',
    '2026-09-24T00:10:41Z', 50);
end; $$;

select is(
  (select count(*) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000077' and kind = 'drink'),
  1::bigint,
  'water is scheduled as a drink and is not blocked by the wave'
);
select is(
  (select count(distinct at_active_second) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000077'),
  (select count(*) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000077'),
  'no two actions share a footfall'
);

-- Projection ----------------------------------------------------------------

select isnt(
  public.read_day_reactions(
    '10000000-0000-4000-8000-000000000077', '2026-09-24T00:10:41Z', 0
  ) -> 'nextScheduledAction',
  'null'::jsonb,
  'the projection names the next scheduled action'
);

-- A photograph can only be recorded for a scheduled photo moment.
select is(
  public.record_day_photo(
    '10000000-0000-4000-8000-000000000077', 999, 1000, 'unscheduled.webp'
  ),
  false,
  'an unscheduled moment is never photographed'
);

select * from finish();
rollback;
