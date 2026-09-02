begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000097', 'phase2-test', 'Phase 2 Test',
  '2026-09-10T00:00:00Z', 7, 'preview',
  '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z', 144, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000097',
  '00000000-0000-4000-8000-000000000097',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-10T00:00:00Z', '2026-09-11T00:00:00Z', 'tashkent-v4', 'live'
);

select has_column('public', 'journeys', 'story_time_scale', 'journeys has rehearsal scale');
select has_column('public', 'votes', 'result_option_id', 'votes retain a deterministic published result');
select is(
  public.journey_story_now('00000000-0000-4000-8000-000000000097', '2026-09-10T00:10:00Z'),
  '2026-09-11T00:00:00Z'::timestamptz,
  '144x rehearsal maps ten real minutes to one story day'
);

select is(
  (select out_visitor_active_seconds from public.record_presence_heartbeat_v3(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-10T00:00:00Z', 50, 1.8
  )), 0::numeric, 'visitor contribution begins at zero'
);
select * from public.record_presence_heartbeat_v3(
  '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
  'active', true, '2026-09-10T00:00:20Z', 50, 1.8
);
select * from public.record_presence_heartbeat_v3(
  '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('2', 64),
  'active', true, '2026-09-10T00:00:20Z', 50, 1.8
);
select * from public.record_presence_heartbeat_v3(
  '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
  'active', true, '2026-09-10T00:00:40Z', 50, 1.8
);
select is(
  (select active_seconds from public.visitor_day_contributions
    where country_day_id = '10000000-0000-4000-8000-000000000097'
      and visitor_hash = repeat('a', 64)),
  40::numeric,
  'two tabs retain one visitor contribution clock instead of summing leases'
);

select throws_ok(
  $$insert into public.postcards (
    country_day_id, visitor_hash, public_token, status, contribution_seconds, expires_at
  ) values (
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), 'guessable', 'pending', 60, now() + interval '1 year'
  )$$,
  '23514', null,
  'postcard public tokens must be high entropy'
);
select ok((select relrowsecurity from pg_class where oid = 'public.postcards'::regclass), 'postcards enforce RLS');

insert into public.sponsor_slots (
  id, country_day_id, price_cents, currency, status
) values (
  '30000000-0000-4000-8000-000000000097',
  '10000000-0000-4000-8000-000000000097', 100, 'USD', 'available'
);

select is(
  (public.reserve_sponsor_slot(
    '30000000-0000-4000-8000-000000000097', 'Test Sponsor', 'test@example.com',
    true, '2026-09-10T00:00:00Z', 30
  )).status,
  'checkout_pending',
  'slot reservation creates checkout_pending sponsorship'
);
select is(
  (select status from public.sponsor_slots where id = '30000000-0000-4000-8000-000000000097'),
  'reserved',
  'slot reservation is atomic'
);
select throws_ok(
  $$update public.sponsorships set status = 'scheduled'
    where slot_id = '30000000-0000-4000-8000-000000000097'$$,
  '22023', null,
  'browser checkout success cannot skip payment and review'
);

update public.sponsorships set status = 'paid_pending_review', paid_at = now()
where slot_id = '30000000-0000-4000-8000-000000000097';
update public.sponsorships set status = 'approved', approved_at = now()
where slot_id = '30000000-0000-4000-8000-000000000097';
select lives_ok(
  $$update public.sponsorships set status = 'scheduled'
    where slot_id = '30000000-0000-4000-8000-000000000097'$$,
  'reviewed sponsorship can be scheduled'
);
select lives_ok(
  $$update public.sponsorships set status = 'refunded', removed_at = now()
    where slot_id = '30000000-0000-4000-8000-000000000097'$$,
  'refund removes a scheduled sponsorship'
);

insert into public.payment_webhook_events (
  provider_event_id, event_name, payload_checksum, processing_status
) values ('order_created:1:abc', 'order_created', repeat('b', 64), 'processed');
select throws_ok(
  $$insert into public.payment_webhook_events (
    provider_event_id, event_name, payload_checksum, processing_status
  ) values ('order_created:1:abc', 'order_created', repeat('b', 64), 'processed')$$,
  '23505', null,
  'duplicate provider webhook identities are rejected'
);

select ok((select relrowsecurity from pg_class where oid = 'public.sponsorships'::regclass), 'sponsorships enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.sponsor_metric_events'::regclass), 'sponsor metric events enforce RLS');
select is((select count(*) from storage.buckets where id in ('khw-postcards', 'khw-sponsor-private', 'khw-sponsor-public')), 3::bigint, 'three scoped storage buckets exist');
select is((select public from storage.buckets where id = 'khw-sponsor-private'), false, 'unreviewed sponsor creative bucket is private');

select * from finish();
rollback;
