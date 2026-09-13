begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000240', 'phase24-reaction-watchers-test',
  'Phase 24 Reaction Watchers Test', '2026-09-28T00:00:00Z', 1, 'preview',
  '2026-09-28T00:00:00Z', '2026-09-28T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000241',
  '00000000-0000-4000-8000-000000000240',
  1, 'FR', 'France', 'Paris', 'Europe/Paris',
  '2026-09-28T00:00:00Z', '2026-09-29T00:00:00Z', 'paris-v1', 'live'
);

-- Schema and grants -----------------------------------------------------------------

select has_table('public', 'reaction_requests', 'a reaction request belongs to one watcher');
select col_is_pk(
  'public', 'reaction_requests',
  array['country_day_id', 'kind', 'visitor_hash'],
  'one request per watcher per kind per day'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reaction_requests'::regclass),
  'reaction requests enforce RLS'
);
select is(
  has_table_privilege('anon', 'public.reaction_requests', 'SELECT'),
  false,
  'anon cannot read who asked'
);
select has_function(
  'public', 'submit_reaction_v2',
  array['uuid', 'text', 'text', 'reaction_kind', 'timestamp with time zone', 'integer'],
  'the watcher reaction RPC exists'
);
select is(
  has_function_privilege(
    'anon',
    'public.submit_reaction_v2(uuid,text,text,public.reaction_kind,timestamptz,integer)',
    'EXECUTE'
  ),
  false,
  'anon cannot submit reactions directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.submit_reaction_v2(uuid,text,text,public.reaction_kind,timestamptz,integer)',
    'EXECUTE'
  ),
  true,
  'the server submits reactions for a watcher'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reaction_request_core(uuid,text,public.reaction_kind,timestamptz,integer)',
    'EXECUTE'
  ),
  false,
  'the counting core is reachable only through the reaction RPCs'
);
select is(
  has_function_privilege(
    'service_role', 'public.read_reactions_now(uuid,timestamptz,integer)', 'EXECUTE'
  ),
  true,
  'the server reads the board in one call'
);

-- Seven watchers, so the room needs three --------------------------------------------

do $$
declare
  v_index integer;
begin
  for v_index in 1..7 loop
    perform * from public.record_presence_heartbeat_v12(
      '10000000-0000-4000-8000-000000000241',
      repeat(chr(96 + v_index), 64), repeat(v_index::text, 64),
      'active', true, '2026-09-28T00:10:00Z', 50, 1.8, 5, 600, 'FR'
    );
  end loop;
end; $$;

select is(
  (select out_status from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('z', 64), repeat('n', 64),
    'wave', '2026-09-28T00:10:01Z', 50
  )),
  'not_watching',
  'someone who is not watching cannot ask'
);
select is(
  (select count(*) from public.reaction_requests where visitor_hash = repeat('z', 64)),
  0::bigint,
  'a refused request is not recorded'
);

create temporary table first_ask as
select * from public.submit_reaction_v2(
  '10000000-0000-4000-8000-000000000241', repeat('a', 64), repeat('n', 64),
  'wave', '2026-09-28T00:10:01Z', 50
);
select results_eq(
  $$ select out_status, out_count, out_threshold from first_ask $$,
  $$ values ('counted'::text, 1, 3) $$,
  'a watcher''s request counts toward the room''s threshold'
);

create temporary table ask_again as
select * from public.submit_reaction_v2(
  '10000000-0000-4000-8000-000000000241', repeat('a', 64), repeat('n', 64),
  'wave', '2026-09-28T00:10:02Z', 50
);
select results_eq(
  $$ select out_status, out_retry_after_seconds from ask_again $$,
  $$ values ('cooldown'::text, 59) $$,
  'one request per kind per watcher per rolling minute'
);
select is(
  (public.read_day_reactions(
    '10000000-0000-4000-8000-000000000241', '2026-09-28T00:10:02Z', 2
  ) #>> '{counts,wave}')::integer,
  1,
  'asking twice still counts one watcher'
);

-- The window rolls ---------------------------------------------------------------------

create temporary table later_ask as
select * from public.submit_reaction_v2(
  '10000000-0000-4000-8000-000000000241', repeat('b', 64), repeat('n', 64),
  'wave', '2026-09-28T00:10:40Z', 50
);
select is(
  (select out_count from later_ask),
  1,
  'a request older than thirty seconds no longer counts'
);

do $$ begin
  perform * from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('c', 64), repeat('n', 64),
    'wave', '2026-09-28T00:10:41Z', 50
  );
end; $$;

create temporary table crowd_ask as
select * from public.submit_reaction_v2(
  '10000000-0000-4000-8000-000000000241', repeat('d', 64), repeat('n', 64),
  'wave', '2026-09-28T00:10:42Z', 50
);
select results_eq(
  $$ select out_status, out_count from crowd_ask $$,
  $$ values ('scheduled'::text, 0) $$,
  'the third distinct watcher inside thirty seconds books the wave'
);
select is(
  (select count(*) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000241'
     and kind = 'wave' and source = 'crowd'),
  1::bigint,
  'the room books exactly one wave'
);

-- He rests, and nothing counts meanwhile -------------------------------------------------

create temporary table resting_ask as
select * from public.submit_reaction_v2(
  '10000000-0000-4000-8000-000000000241', repeat('e', 64), repeat('n', 64),
  'wave', '2026-09-28T00:10:43Z', 50
);
select results_eq(
  $$ select out_status, out_rest_until_active_second - (select out_scheduled_at from crowd_ask)
     from resting_ask $$,
  $$ values ('resting'::text, 120) $$,
  'while he rests from a wave, a new wave is refused with the second it becomes possible'
);
select is(
  (select count(*) from public.reaction_requests
   where visitor_hash = repeat('e', 64) and kind = 'wave'),
  0::bigint,
  'nothing counts while he rests'
);
select results_eq(
  $$ select (board #>> '{counts,wave}')::integer,
       (board #>> '{rest,wave}')::integer - (select out_scheduled_at from crowd_ask)
     from (select public.read_day_reactions(
       '10000000-0000-4000-8000-000000000241', '2026-09-28T00:10:43Z', 43
     ) as board) reads $$,
  $$ values (0, 120) $$,
  'the board shows the rest instead of a count'
);
select isnt(
  (select out_reactions from resting_ask),
  null::jsonb,
  'an answer carries a fresh board'
);

-- The rollback signature and the one-call read ---------------------------------------------

create temporary table legacy_photo as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000241', repeat('f', 64), 'photo',
  '2026-09-28T00:10:44Z', 50
);
select results_eq(
  $$ select out_count, out_threshold, out_rate_limited from legacy_photo $$,
  $$ values (1, 3, false) $$,
  'the rollback signature counts watchers the same way'
);
select is(
  (public.read_reactions_now(
    '10000000-0000-4000-8000-000000000241', '2026-09-28T00:10:45Z', 50
  ) #>> '{counts,photo}')::integer,
  1,
  'the one-call board reads the same count'
);

-- Old requests are pruned ---------------------------------------------------------------------

insert into public.reaction_requests (country_day_id, kind, visitor_hash, requested_at)
values ('10000000-0000-4000-8000-000000000241', 'water', repeat('y', 64), '2000-01-01T00:00:00Z');

do $$ begin
  perform * from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('g', 64), repeat('n', 64),
    'water', '2026-09-28T00:10:46Z', 50
  );
end; $$;

select is(
  (select count(*) from public.reaction_requests where visitor_hash = repeat('y', 64)),
  0::bigint,
  'a request older than ten minutes is pruned'
);

-- Limits ---------------------------------------------------------------------------------------

do $$
declare
  v_index integer;
begin
  for v_index in 1..60 loop
    perform * from public.submit_reaction_v2(
      '10000000-0000-4000-8000-000000000241', lpad(v_index::text, 64, 'v'), repeat('m', 64),
      'wave', '2026-09-28T00:20:01Z', 50
    );
  end loop;
end; $$;

select is(
  (select out_status from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('w', 64), repeat('m', 64),
    'wave', '2026-09-28T00:20:02Z', 50
  )),
  'rate_limited',
  'one network cannot send more than sixty reactions a minute'
);

do $$
declare
  v_index integer;
begin
  for v_index in 1..12 loop
    perform * from public.submit_reaction_v2(
      '10000000-0000-4000-8000-000000000241', repeat('x', 64), lpad(v_index::text, 64, 'k'),
      'photo', '2026-09-28T00:30:01Z', 50
    );
  end loop;
end; $$;

select is(
  (select out_status from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('x', 64), repeat('j', 64),
    'photo', '2026-09-28T00:30:02Z', 50
  )),
  'rate_limited',
  'one visitor cannot send more than twelve reactions a minute'
);

select throws_ok(
  $$ select * from public.submit_reaction_v2(
    '10000000-0000-4000-8000-000000000241', repeat('a', 64), 'short',
    'wave', '2026-09-28T00:40:00Z', 50
  ) $$,
  '22023',
  'invalid network key',
  'a request without a network key is refused'
);

select * from finish();
rollback;
