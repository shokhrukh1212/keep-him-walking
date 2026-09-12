begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000150', 'phase15-pricing-test',
  'Phase 15 Pricing Test', '2033-03-01T16:00:00Z', 30, 'preview',
  '2033-03-01T16:00:00Z', '2033-03-01T16:00:00Z', 1, true
);

-- Day 1 is finalized; day 2 is live. "Today" on the rollover clock is 2033-03-02.
insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  (
    '10000000-0000-4000-8000-000000000151',
    '00000000-0000-4000-8000-000000000150',
    1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
    '2033-03-01T16:00:00Z', '2033-03-02T16:00:00Z', 'tashkent-v4', 'completed'
  ),
  (
    '10000000-0000-4000-8000-000000000152',
    '00000000-0000-4000-8000-000000000150',
    2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
    '2033-03-02T16:00:00Z', '2033-03-03T16:00:00Z', 'dushanbe-v1', 'live'
  );

insert into public.day_outcomes (
  country_day_id, distance_metres, landmark_reached, marathon,
  peak_watchers, unique_watchers, countries_count, top_country
) values (
  '10000000-0000-4000-8000-000000000151', 9000, true, false, 40, 12000, 9, 'UZ'
);

select has_table('public', 'sponsor_pricing', 'the pricing ledger exists');
select has_column('public', 'sponsor_pricing', 'basis_uniques', 'each price records the audience that set it');
select has_column('public', 'sponsor_slots', 'slot_date', 'inventory is keyed by date');
select has_column('public', 'sponsorships', 'tier', 'a purchase records its tier');
select col_is_null('public', 'sponsor_slots', 'country_day_id', 'a future slot has no country-day yet');

select has_function('public', 'sponsor_price_cents', array['integer','integer','integer','integer'], 'the public formula is a function');
select has_function('public', 'open_sponsor_pricing_window', array['uuid','timestamp with time zone','integer','integer','integer','integer','integer','character'], 'the rolling window opens at rollover');
select has_function('public', 'bind_sponsor_slot_day', array['uuid','timestamp with time zone'], 'a sold date binds to its country-day');
select has_function('public', 'reserve_sponsor_slot_v2', array['uuid','text','text','text','boolean','timestamp with time zone','integer','numeric','integer'], 'reservation enforces tier and window');

select is(has_function_privilege('anon', 'public.open_sponsor_pricing_window(uuid,timestamptz,integer,integer,integer,integer,integer,char)', 'EXECUTE'), false, 'anon cannot open pricing');
select is(has_function_privilege('service_role', 'public.open_sponsor_pricing_window(uuid,timestamptz,integer,integer,integer,integer,integer,char)', 'EXECUTE'), true, 'service_role can open pricing');
select is(has_function_privilege('anon', 'public.reserve_sponsor_slot_v2(uuid,text,text,text,boolean,timestamptz,integer,numeric,integer)', 'EXECUTE'), false, 'anon cannot reserve a slot');
select is((select relrowsecurity from pg_class where oid = 'public.sponsor_pricing'::regclass), true, 'pricing rows are behind row level security');

-- The clamp, at the floor, on the ladder, and at the cap.
select is(public.sponsor_price_cents(0, 4900, 1, 299900), 4900, 'no audience still prices at the floor');
select is(public.sponsor_price_cents(12000, 4900, 1, 299900), 12000, 'twelve thousand watchers price the day at $120');
select is(public.sponsor_price_cents(500000, 4900, 1, 299900), 299900, 'a viral day is capped at $2,999');
select is(public.sponsor_tier_price_cents(4900, 'premium', 1.5), 7350, 'premium preserves the exact cent result');
select is(public.sponsor_tier_price_cents(4900, 'standard', 1.5), 4900, 'standard is unmultiplied');

select is(public.journey_slot_date('00000000-0000-4000-8000-000000000150', '2033-03-02T20:00:00Z'), '2033-03-02'::date, 'today follows the rollover clock, not the calendar');

-- Season day 1 is inside the founding block, so the window mixes both prices.
create temporary table opened as
select public.open_sponsor_pricing_window(
  '00000000-0000-4000-8000-000000000150', '2033-03-02T16:00:00Z',
  4900, 1, 2900, 299900, 7, 'USD'
) as result;
select is((select count(*)::integer from public.sponsor_pricing where journey_id = '00000000-0000-4000-8000-000000000150'), 7, 'exactly seven days are open for sale');
select is((select price_cents from public.sponsor_pricing where journey_id = '00000000-0000-4000-8000-000000000150' and day_date = '2033-03-09'), 12000, 'a new day is priced by yesterday''s unique watchers');
select is((select basis_uniques from public.sponsor_pricing where journey_id = '00000000-0000-4000-8000-000000000150' and day_date = '2033-03-09'), 12000, 'the price records the audience that set it');

-- Re-running the same window must never re-price a day that is already on sale.
update public.day_outcomes set unique_watchers = 90000 where country_day_id = '10000000-0000-4000-8000-000000000151';
create temporary table reopened as
select public.open_sponsor_pricing_window(
  '00000000-0000-4000-8000-000000000150', '2033-03-02T16:05:00Z',
  4900, 1, 2900, 299900, 7, 'USD'
) as result;
select is((select price_cents from public.sponsor_pricing where journey_id = '00000000-0000-4000-8000-000000000150' and day_date = '2033-03-09'), 12000, 'an open day keeps the price it opened at');

-- A day beyond the rolling window is refused even with a real slot id.
select throws_ok(
  $$select public.reserve_sponsor_slot_v2(
    (select id from public.sponsor_slots where journey_id = '00000000-0000-4000-8000-000000000150' and slot_date = '2033-03-09'),
    'Acme', 'sponsor@example.com', 'standard', true, '2033-03-02T17:00:00Z', 30, 1.5, 3
  )$$,
  '22023',
  'sponsor day is outside the purchasable window',
  'a day past the window cannot be bought'
);

-- A premium purchase snapshots the multiplied price against the slot it reserved.
create temporary table reserved as
select * from public.reserve_sponsor_slot_v2(
  (select id from public.sponsor_slots where journey_id = '00000000-0000-4000-8000-000000000150' and slot_date = '2033-03-03'),
  'Acme', 'sponsor@example.com', 'premium', true, '2033-03-02T17:00:00Z', 30, 1.5, 7
);
select is((select tier from reserved), 'premium', 'the purchase records its tier');
select is((select expected_price_cents from reserved), 4350, 'the premium snapshot is exactly 1.5x the founding price');

select * from finish();
rollback;
