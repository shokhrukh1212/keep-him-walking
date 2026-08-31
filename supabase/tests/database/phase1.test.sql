begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.journeys (id, slug, title, starts_at, total_days, status)
values (
  '00000000-0000-4000-8000-000000000099',
  'phase1-test',
  'Phase 1 Test',
  '2026-09-01T00:00:00Z',
  195,
  'active'
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000099',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 'test', 'live'
);

select is(
  (select out_active_viewers from public.record_presence_heartbeat(
    '10000000-0000-4000-8000-000000000099', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-01T00:00:00Z', 50, 1.8
  )),
  1::bigint,
  'first active session counts as one viewer'
);

select is(
  (select out_global_steps from public.record_presence_heartbeat(
    '10000000-0000-4000-8000-000000000099', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-01T00:00:20Z', 50, 1.8
  )),
  36::bigint,
  'twenty active seconds produce 36 global steps'
);

select is(
  (select out_active_viewers from public.record_presence_heartbeat(
    '10000000-0000-4000-8000-000000000099', repeat('a', 64), repeat('2', 64),
    'active', true, '2026-09-01T00:00:21Z', 50, 1.8
  )),
  1::bigint,
  'two tabs sharing a visitor hash count as one person'
);

select is(
  (select out_active_viewers from public.record_presence_heartbeat(
    '10000000-0000-4000-8000-000000000099', repeat('b', 64), repeat('3', 64),
    'active', true, '2026-09-01T00:00:22Z', 50, 1.8
  )),
  2::bigint,
  'a second visitor hash counts as a second person'
);

select is(
  (select out_active_viewers from public.record_presence_heartbeat(
    '10000000-0000-4000-8000-000000000099', null, null,
    'observe', false, '2026-09-01T00:03:20Z', 50, 1.8
  )),
  0::bigint,
  'all abandoned leases expire after TTL'
);

select is(
  (select global_steps from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000099'),
  129::bigint,
  'walking time stops at the final lease expiry instead of running to observation time'
);

insert into public.votes (
  id, country_day_id, question, opens_at, closes_at, result_publishes_at, status
) values (
  '30000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099',
  'Test?', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z',
  '2026-09-02T00:00:00Z', 'open'
);

insert into public.vote_options (id, vote_id, label, display_order) values
  ('40000000-0000-4000-8000-000000000098', '30000000-0000-4000-8000-000000000099', 'One', 0),
  ('40000000-0000-4000-8000-000000000099', '30000000-0000-4000-8000-000000000099', 'Two', 1);

select ok(
  (select out_accepted from public.submit_phase1_ballot(
    '30000000-0000-4000-8000-000000000099',
    '40000000-0000-4000-8000-000000000098', repeat('c', 64),
    '2026-09-01T01:00:00Z'
  )),
  'first ballot is accepted'
);

select ok(
  (select out_idempotent from public.submit_phase1_ballot(
    '30000000-0000-4000-8000-000000000099',
    '40000000-0000-4000-8000-000000000098', repeat('c', 64),
    '2026-09-01T01:00:01Z'
  )),
  'retrying the same ballot is idempotent'
);

select isnt(
  (select out_accepted from public.submit_phase1_ballot(
    '30000000-0000-4000-8000-000000000099',
    '40000000-0000-4000-8000-000000000099', repeat('c', 64),
    '2026-09-01T01:00:02Z'
  )),
  true,
  'a conflicting second choice is rejected'
);

select is(
  (select count(*) from public.ballots
    where vote_id = '30000000-0000-4000-8000-000000000099'),
  1::bigint,
  'idempotent and conflicting retries do not duplicate ballots'
);

select * from finish();
rollback;
