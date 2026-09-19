begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

create function pg_temp.relaunch_plan(p_slug text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'journey', jsonb_build_object('slug', p_slug, 'title', 'Paris test relaunch'),
    'days', (select jsonb_agg(jsonb_build_object(
      'dayNumber', n, 'countryCode', case when n = 1 then 'FR' else 'BE' end,
      'countryName', case when n = 1 then 'France' else 'Belgium' end,
      'cityName', case when n = 1 then 'Paris' else 'City ' || n end,
      'timeZone', 'Europe/Paris', 'scenePackId', 'test-pack-' || n || '-v1',
      'storySummary', 'Test day ' || n
    ) order by n) from generate_series(1, 14) n)
  );
$$;

create function pg_temp.journey_id(p_slug text)
returns uuid language sql as $$ select id from public.journeys where slug = p_slug $$;

select has_column('public', 'journeys', 'lifecycle_state', 'journeys have an explicit business lifecycle');
select has_table('public', 'journey_day_plans', 'waiting plans are stored without fake dates');
select has_table('public', 'journey_admin_events', 'owner lifecycle changes have an audit ledger');
select has_table('public', 'journey_name_votes', 'the relaunch name vote has its own scope');
select has_table('public', 'journey_sponsor_slots', 'journey placement inventory is persisted');
select has_table('public', 'journey_sponsor_orders', 'placement orders are persisted');
select has_table('public', 'journey_sponsor_payments', 'all placement payments have a ledger');
select has_table('public', 'journey_sponsor_view_events', 'profile opens have an idempotency ledger');
select is(has_table_privilege('anon', 'public.journey_admin_events', 'SELECT'), false, 'public visitors cannot read owner events');
select is(has_function_privilege('anon', 'public.reserve_journey_sponsor_slot(uuid,text,text,text,text,text,text,boolean,text,text,boolean,integer,timestamptz)', 'EXECUTE'), false, 'the browser cannot reserve a slot directly');
select is(has_function_privilege('service_role', 'public.set_relaunch_journey_state(uuid,text,timestamptz,text,timestamptz)', 'EXECUTE'), true, 'the protected server can control lifecycle');

create temporary table prepared as
select public.prepare_paris_relaunch(pg_temp.relaunch_plan('test-paris-relaunch'), true, 'pgtap', '2035-01-01T00:00:00Z') result;
select is((select result ->> 'state' from prepared), 'created', 'the reviewed Paris plan creates once');
select is((select lifecycle_state from public.journeys where slug = 'test-paris-relaunch'), 'waiting', 'the new journey starts waiting');
select is((select starts_at from public.journeys where slug = 'test-paris-relaunch'), null::timestamptz, 'waiting has no invented launch timestamp');
select is((select count(*) from public.journey_day_plans where journey_id = pg_temp.journey_id('test-paris-relaunch')), 14::bigint, 'all fourteen undated days are planned');
select is((select count(*) from public.journey_sponsor_slots where journey_id = pg_temp.journey_id('test-paris-relaunch') and tier = 'regular'), 10::bigint, 'ten regular slots are created');
select is((select count(*) from public.journey_sponsor_slots where journey_id = pg_temp.journey_id('test-paris-relaunch') and tier = 'featured'), 1::bigint, 'one distinct featured slot is created');
select is((select count(*) from public.journey_name_vote_options o join public.journey_name_votes v on v.id = o.vote_id where v.journey_id = pg_temp.journey_id('test-paris-relaunch')), 4::bigint, 'Milo, Nur, Sami and Bek are scoped to the relaunch');
select is(public.reconcile_relaunch_journeys('2035-06-01T00:00:00Z') ->> 'started', '0', 'an undated waiting journey ignores passing time');
select is(public.submit_waiting_reaction(pg_temp.journey_id('test-paris-relaunch'), 'wave', repeat('9', 64), '2035-01-01T00:00:00Z') ->> 'state', 'scheduled', 'waiting interactions are persisted and scheduled without route progress');
select throws_ok($$select public.submit_waiting_reaction(pg_temp.journey_id('test-paris-relaunch'), 'photo', repeat('9', 64), '2035-01-01T00:00:01Z')$$,
  '55000', 'reaction rate limited', 'waiting reactions enforce a per-browser cooldown');

select is(public.submit_journey_name_ballot(
  (select id from public.journey_name_votes where journey_id = pg_temp.journey_id('test-paris-relaunch')),
  (select o.id from public.journey_name_vote_options o join public.journey_name_votes v on v.id = o.vote_id where v.journey_id = pg_temp.journey_id('test-paris-relaunch') and o.label = 'Nur'),
  repeat('a', 64), '2035-01-01T00:01:00Z') ->> 'state', 'accepted', 'a waiting name ballot is persisted');
select is((select (tally ->> 'votes')::int from jsonb_array_elements(public.submit_journey_name_ballot(
  (select id from public.journey_name_votes where journey_id = pg_temp.journey_id('test-paris-relaunch')),
  (select o.id from public.journey_name_vote_options o join public.journey_name_votes v on v.id = o.vote_id where v.journey_id = pg_temp.journey_id('test-paris-relaunch') and o.label = 'Nur'),
  repeat('b', 64), '2035-01-01T00:02:00Z') -> 'tallies') tally
  where tally ->> 'optionId' = (select o.id::text from public.journey_name_vote_options o join public.journey_name_votes v on v.id = o.vote_id where v.journey_id = pg_temp.journey_id('test-paris-relaunch') and o.label = 'Nur')),
  2, 'the accepted ballot returns the option tally it just produced');
select is((select count(*) from jsonb_array_elements(public.submit_journey_name_ballot(
  (select id from public.journey_name_votes where journey_id = pg_temp.journey_id('test-paris-relaunch')),
  (select o.id from public.journey_name_vote_options o join public.journey_name_votes v on v.id = o.vote_id where v.journey_id = pg_temp.journey_id('test-paris-relaunch') and o.label = 'Milo'),
  repeat('c', 64), '2035-01-01T00:03:00Z') -> 'tallies')), 4::bigint, 'every option is named in the returned tallies');
select is(public.set_relaunch_journey_state(pg_temp.journey_id('test-paris-relaunch'), 'schedule', '2035-02-01T19:00:00Z', 'owner', '2035-01-02T00:00:00Z') ->> 'state', 'scheduled', 'the owner can arm a future start');
select is((select scheduled_start_at from public.journeys where slug = 'test-paris-relaunch'), '2035-02-01T19:00:00Z'::timestamptz, 'the exact armed instant is stored in UTC');
select is(public.set_relaunch_journey_state(pg_temp.journey_id('test-paris-relaunch'), 'cancel', null, 'owner', '2035-01-03T00:00:00Z') ->> 'state', 'waiting', 'the owner can cancel an armed launch');
select is((select scheduled_start_at from public.journeys where slug = 'test-paris-relaunch'), null::timestamptz, 'cancelling removes the stale timestamp');
select is(public.set_relaunch_journey_state(pg_temp.journey_id('test-paris-relaunch'), 'schedule', '2035-02-01T19:00:00Z', 'owner', '2035-01-04T00:00:00Z') ->> 'state', 'scheduled', 'a cancelled journey can be scheduled again');
select is(public.reconcile_relaunch_journeys('2035-02-01T19:05:00Z') ->> 'started', '1', 'durable reconciliation starts a due schedule');
select is((select lifecycle_state from public.journeys where slug = 'test-paris-relaunch'), 'live', 'the due journey becomes live once');
select is((select starts_at from public.journeys where slug = 'test-paris-relaunch'), '2035-02-01T19:00:00Z'::timestamptz, 'late reconciliation preserves the owner effective start');
select is((select ends_at - starts_at from public.journeys where slug = 'test-paris-relaunch'), interval '14 days', 'the fourteen days begin at actual launch');
select is((select count(*) from public.country_days where journey_id = pg_temp.journey_id('test-paris-relaunch')), 14::bigint, 'launch materializes exactly fourteen dated days');
select is((select count(*) from public.journey_runtime jr join public.country_days cd on cd.id = jr.country_day_id where cd.journey_id = pg_temp.journey_id('test-paris-relaunch')), 14::bigint, 'every live day has an authoritative zeroed runtime');
select is((select traveler_name from public.journeys where slug = 'test-paris-relaunch'), 'Nur', 'launch resolves the name vote once');
select throws_ok($$select public.set_relaunch_journey_state(pg_temp.journey_id('test-paris-relaunch'), 'waiting', null, 'owner', '2035-02-01T20:00:00Z')$$,
  '55000', 'a live journey cannot return to waiting', 'waiting is never a destructive live pause');

create temporary table regular_slot as select id from public.journey_sponsor_slots where journey_id = pg_temp.journey_id('test-paris-relaunch') and tier = 'regular' and position = 1;
create temporary table regular_order as select public.reserve_journey_sponsor_slot((select id from regular_slot), repeat('b',64), 'https://product.example/', 'Product', 'A useful product.', 'private/product.webp', 'contain', true, 'fixture', 'fixture_regular_placement', true, 10, '2035-02-02T00:00:00Z') result;
select is((select result ->> 'state' from regular_order), 'reserved', 'checkout submission atomically reserves an available slot');
select is(public.reserve_journey_sponsor_slot((select id from regular_slot), repeat('c',64), 'https://other.example/', 'Other', 'Another product.', 'private/other.webp', 'crop', true, 'fixture', 'fixture_regular_placement', true, 10, '2035-02-02T00:00:01Z') ->> 'state', 'unavailable', 'a concurrent buyer cannot reserve the same slot');
select is(public.attach_journey_sponsor_checkout(((select result from regular_order) ->> 'orderId')::uuid, 'fixture_regular', '2035-02-03T00:00:00Z', '2035-02-02T00:00:02Z') ->> 'state', 'payment_pending', 'the provider checkout extends the reservation to its bounded lifetime');
select is(public.confirm_journey_sponsor_payment('fixture', 'pay_regular', ((select result from regular_order) ->> 'orderId')::uuid, 'fixture_regular', 5000, 0, 'USD', true, true, false, 'public/product.webp', 'buyer@example.com', null, '2035-02-02T00:01:00Z') ->> 'outcome', 'active', 'a matching verified payment publishes promptly');
select is((select state from public.journey_sponsor_slots where id = (select id from regular_slot)), 'occupied', 'only the paid winner occupies the regular slot');
select is(public.confirm_journey_sponsor_payment('fixture', 'pay_regular', ((select result from regular_order) ->> 'orderId')::uuid, 'fixture_regular', 5000, 0, 'USD', true, true, false, 'public/product.webp', 'buyer@example.com', null, '2035-02-02T00:02:00Z') ->> 'duplicate', 'true', 'a duplicate payment changes nothing');

create temporary table featured_slot as select id from public.journey_sponsor_slots where journey_id = pg_temp.journey_id('test-paris-relaunch') and tier = 'featured';
create temporary table featured_order as select public.reserve_journey_sponsor_slot((select id from featured_slot), repeat('d',64), 'https://featured.example/', 'Featured', 'A featured product.', 'private/featured.webp', 'crop', true, 'fixture', 'fixture_featured_placement', true, 10, '2035-02-02T01:00:00Z') result;
select is((select result ->> 'state' from featured_order), 'reserved', 'featured inventory is independent from regular inventory');
select is(public.attach_journey_sponsor_checkout(((select result from featured_order) ->> 'orderId')::uuid, 'fixture_featured', '2035-02-03T01:00:00Z', '2035-02-02T01:00:01Z') ->> 'state', 'payment_pending', 'the single featured slot has one provider checkout');
select is(public.confirm_journey_sponsor_payment('fixture', 'pay_featured_wrong', ((select result from featured_order) ->> 'orderId')::uuid, 'fixture_featured', 5000, 0, 'USD', true, true, false, 'public/featured.webp', 'buyer@example.com', null, '2035-02-02T01:01:00Z') ->> 'outcome', 'refund_required', 'a wrong featured amount never fulfills');
select is(public.record_journey_sponsor_refund('fixture', 'pay_featured_wrong', '2035-02-02T01:02:00Z') ->> 'state', 'refunded', 'an unfulfilled paid transaction has an idempotent refund path');
select is((select state from public.journey_sponsor_slots where id = (select id from featured_slot)), 'available', 'a confirmed refund releases featured inventory');

select is(public.record_journey_sponsor_view((select public_id from public.journey_sponsor_orders where id = ((select result from regular_order) ->> 'orderId')::uuid), '10000000-0000-4000-8000-000000000001', repeat('e',64), repeat('f',64), '2035-02-02T02:00:00Z') ->> 'accepted', 'true', 'a deliberate product profile open is counted');
select is(public.record_journey_sponsor_view((select public_id from public.journey_sponsor_orders where id = ((select result from regular_order) ->> 'orderId')::uuid), '10000000-0000-4000-8000-000000000001', repeat('e',64), repeat('f',64), '2035-02-02T02:00:01Z') ->> 'duplicate', 'true', 'duplicate delivery of one view event is suppressed');
select is((select view_count from public.journey_sponsor_orders where id = ((select result from regular_order) ->> 'orderId')::uuid), 1::bigint, 'profile views increment atomically and do not count impressions');
select is(has_function_privilege('anon', 'public.submit_journey_name_ballot(uuid,uuid,text,timestamptz)', 'EXECUTE'), false, 'the browser cannot call the name ballot RPC');
select is((select count(*) from public.journey_admin_events where journey_id = pg_temp.journey_id('test-paris-relaunch') and action in ('prepared','scheduled','schedule_cancelled','started')), 5::bigint, 'owner and scheduler lifecycle changes are auditable');

select * from finish();
rollback;
