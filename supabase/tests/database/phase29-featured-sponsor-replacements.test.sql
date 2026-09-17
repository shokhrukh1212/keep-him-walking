begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.plan()
returns jsonb language sql as $$
  select jsonb_build_object(
    'season', jsonb_build_object('slug','test-featured-replacement','title','Featured sponsor test','seasonNumber',929,
      'startsAt','2035-03-01T16:00:00Z','endsAt','2035-03-08T16:00:00Z'),
    'days', (select jsonb_agg(jsonb_build_object('dayNumber',n,'countryCode','FR','countryName','France','cityName','City ' || n,
      'timeZone','Europe/Paris','scenePackId','featured-' || n || '-v1') order by n) from generate_series(1,7) n)
  )
$$;

select public.configure_season(pg_temp.plan(), '2035-01-01T00:00:00Z');

create function pg_temp.submit(p_name text, p_now timestamptz)
returns jsonb language sql as $$
  select public.submit_season_sponsorship(
    (select id from public.journeys where slug='test-featured-replacement'), p_name,
    'https://' || lower(p_name) || '.example.com/', 'A reviewed placement.', 'Casey',
    lower(p_name) || '@example.com', 'private/' || lower(p_name) || '.webp', true, p_now, 24)
$$;
create function pg_temp.booking(p_name text)
returns public.season_sponsorships language sql as $$
  select * from public.season_sponsorships where product_name=p_name
$$;

select is(pg_temp.submit('Alpha', '2035-02-01T10:00:00Z') ->> 'state', 'submitted', 'the first featured sponsor can submit');
select is((pg_temp.booking('Alpha')).price_cents, 5000, 'the first featured sponsor is quoted USD 50');
select is(public.review_season_sponsorship((pg_temp.booking('Alpha')).id, 'approved', 'public/alpha.webp', '2035-02-01T10:02:00Z', 24) ->> 'state', 'approved', 'the first material is reviewed before payment');
select public.hold_season_sponsorship((pg_temp.booking('Alpha')).public_id, 'fixture', true, 30, 30, 24, '2035-02-01T10:05:00Z');
select is(public.confirm_season_payment('fixture','pay_alpha',(pg_temp.booking('Alpha')).id,'chk_alpha',5000,0,'USD',true,true,false,'2035-02-01T10:10:00Z') ->> 'outcome', 'scheduled', 'the first verified payment schedules the featured placement');

select is(pg_temp.submit('Beta', '2035-02-01T11:00:00Z') ->> 'state', 'submitted', 'a replacement can submit while a sponsor is scheduled');
select is((pg_temp.booking('Beta')).price_cents, 10000, 'a replacement quote doubles the current sponsor price');
select is(public.review_season_sponsorship((pg_temp.booking('Beta')).id, 'approved', 'public/beta.webp', '2035-02-01T11:02:00Z', 24) ->> 'state', 'approved', 'replacement material is reviewed before payment');
select is(public.hold_season_sponsorship((pg_temp.booking('Beta')).public_id, 'fixture', true, 30, 30, 24, '2035-02-01T11:05:00Z') ->> 'state', 'held', 'a replacement checkout can be held beside the incumbent');
create temporary table replacement as
  select public.confirm_season_payment('fixture','pay_beta',(pg_temp.booking('Beta')).id,'chk_beta',10000,0,'USD',true,true,false,'2035-02-01T11:10:00Z') as result;
select is((select result ->> 'outcome' from replacement), 'scheduled', 'the replacement payment schedules the new sponsor');
select is((select result ->> 'refundPaymentId' from replacement), 'pay_alpha', 'the displaced payment is returned for refund');
select is((pg_temp.booking('Alpha')).status, 'refund_required', 'the displaced sponsor enters the refund state atomically');
select is((select outcome from public.season_sponsor_payments where payment_id='pay_alpha'), 'refund_required', 'the displaced payment remains visible for refund retry');
select is((pg_temp.booking('Beta')).status, 'scheduled', 'only the replacement remains scheduled');
select is(public.record_season_refund('fixture','pay_alpha','2035-02-01T11:15:00Z') ->> 'status', 'refunded', 'the provider refund event completes the displaced refund');
select is((pg_temp.booking('Alpha')).status, 'refunded', 'the displaced booking is closed after refund confirmation');
select is(public.season_replacement_price((select id from public.journeys where slug='test-featured-replacement')), 20000, 'the next quote doubles the replacement price again');

select * from finish();
rollback;
