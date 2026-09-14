begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

create function pg_temp.season_plan(p_slug text, p_number integer, p_starts timestamptz)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'season', jsonb_build_object(
      'slug', p_slug, 'title', 'Season ' || p_number, 'seasonNumber', p_number,
      'startsAt', p_starts, 'endsAt', p_starts + interval '168 hours'
    ),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'dayNumber', n, 'countryCode', 'FR', 'countryName', 'France', 'cityName', 'City ' || n,
        'timeZone', 'Europe/Paris', 'scenePackId', 'pack-' || n || '-v1'
      ) order by n)
      from generate_series(1, 7) as n
    )
  );
$$;

create function pg_temp.season_id(p_slug text)
returns uuid
language sql
as $$ select id from public.journeys where slug = p_slug $$;

create function pg_temp.submit(p_slug text, p_name text, p_now timestamptz)
returns jsonb
language sql
as $$
  select public.submit_season_sponsorship(
    pg_temp.season_id(p_slug), p_name, 'https://' || lower(p_name) || '.example.com/',
    'A short factual description of ' || p_name || '.', 'Casey Owner',
    'Owner@' || lower(p_name) || '.example.com', 'private/' || lower(p_name) || '.webp',
    true, p_now, 24
  );
$$;

create function pg_temp.booking(p_name text)
returns public.season_sponsorships
language sql
as $$ select * from public.season_sponsorships where product_name = p_name $$;

select public.configure_season(pg_temp.season_plan('test-sponsor-a', 911, '2034-03-01T16:00:00Z'), '2034-01-01T00:00:00Z');
select public.configure_season(pg_temp.season_plan('test-sponsor-started', 912, '2034-01-10T16:00:00Z'), '2034-01-01T00:00:00Z');
select public.configure_season(pg_temp.season_plan('test-sponsor-d', 913, '2034-04-01T16:00:00Z'), '2034-01-01T00:00:00Z');

insert into public.season_sponsor_prices (season_number, price_cents)
values (911, 49900), (912, 49900), (913, 49900);

select has_table('public', 'season_sponsorships', 'season bookings have their own table');
select has_table('public', 'season_sponsor_payments', 'every provider payment is recorded once');
select has_table('public', 'season_sponsor_prices', 'the first three season prices are configured server-side');
select is((select relrowsecurity from pg_class where oid = 'public.season_sponsorships'::regclass), true, 'bookings and contact details are behind row level security');
select is(has_table_privilege('anon', 'public.season_sponsorships', 'SELECT'), false, 'anon cannot read contact details');
select is(has_function_privilege('anon', 'public.submit_season_sponsorship(uuid,text,text,text,text,text,text,boolean,timestamptz,integer)', 'EXECUTE'), false, 'anon cannot submit directly');
select is(has_function_privilege('service_role', 'public.confirm_season_payment(text,text,uuid,text,integer,integer,text,boolean,boolean,boolean,timestamptz)', 'EXECUTE'), true, 'service role confirms payments');

select throws_ok(
  $$select public.submit_season_sponsorship(pg_temp.season_id('test-sponsor-a'), 'Acme', 'https://acme.example.com/', 'A short factual description.', 'Casey Owner', 'casey@acme.example.com', 'private/acme.webp', false, '2034-02-01T10:00:00Z', 24)$$,
  '22023', 'rights to the supplied material must be confirmed', 'the sponsor must confirm rights to the material'
);
select throws_ok(
  $$select pg_temp.submit('test-sponsor-started', 'Late', '2034-01-12T00:00:00Z')$$,
  '55000', 'season is not open for sponsorship', 'a season that started unsponsored runs unsponsored'
);
select throws_ok(
  $$select pg_temp.submit('test-sponsor-a', 'Tardy', '2034-02-28T17:00:00Z')$$,
  '55000', 'season is not open for sponsorship', 'material is due 24 hours before the start'
);
select throws_like(
  $$select public.submit_season_sponsorship(pg_temp.season_id('test-sponsor-a'), 'Plain', 'http://plain.example.com/', 'A short factual description.', 'Casey Owner', 'casey@plain.example.com', 'private/plain.webp', true, '2034-02-01T10:00:00Z', 24)$$,
  '%season_sponsorships_website_url_check%', 'only https websites are accepted'
);

select is(pg_temp.submit('test-sponsor-a', 'Acme', '2034-02-01T10:00:00Z') ->> 'state', 'submitted', 'a genuine request is recorded without payment');
select pg_temp.submit('test-sponsor-a', 'Beta', '2034-02-01T10:05:00Z');
select pg_temp.submit('test-sponsor-a', 'Gamma', '2034-02-01T10:10:00Z');
select is((pg_temp.booking('Acme')).contact_email, 'owner@acme.example.com', 'the private contact is normalized');
select is((pg_temp.booking('Acme')).price_cents, 49900, 'the request snapshots its configured price');
select is((pg_temp.booking('Acme')).quoted_starts_at, '2034-03-01T16:00:00Z'::timestamptz, 'the request snapshots its offered dates');

select throws_ok(
  $$select public.review_season_sponsorship((pg_temp.booking('Acme')).id, 'approved', '', '2034-02-01T11:00:00Z', 24)$$,
  '22023', 'approved material needs its public logo copy', 'approval requires the reviewed public logo'
);
select is(
  public.review_season_sponsorship((pg_temp.booking('Acme')).id, 'approved', 'public/acme.webp', '2034-02-01T11:00:00Z', 24) ->> 'state',
  'approved', 'material is approved before any payment'
);
select public.review_season_sponsorship((pg_temp.booking('Beta')).id, 'approved', 'public/beta.webp', '2034-02-01T11:01:00Z', 24);

update public.season_sponsor_prices set price_cents = 50000 where season_number = 911;
select throws_ok(
  $$select public.hold_season_sponsorship((pg_temp.booking('Acme')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T11:20:00Z')$$,
  '55000', 'season quote changed', 'checkout refuses a configured price that no longer matches the saved quote'
);
update public.season_sponsor_prices set price_cents = 49900 where season_number = 911;

update public.season_sponsorships
set quoted_starts_at = quoted_starts_at + interval '1 day', quoted_ends_at = quoted_ends_at + interval '1 day'
where product_name = 'Acme';
select throws_ok(
  $$select public.hold_season_sponsorship((pg_temp.booking('Acme')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T11:25:00Z')$$,
  '55000', 'season schedule changed', 'checkout refuses dates that no longer match the saved request'
);
update public.season_sponsorships
set quoted_starts_at = quoted_starts_at - interval '1 day', quoted_ends_at = quoted_ends_at - interval '1 day'
where product_name = 'Acme';

select is(
  public.hold_season_sponsorship((pg_temp.booking('Gamma')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T11:30:00Z') ->> 'state',
  'not_approved', 'unapproved material cannot request payment'
);
select is(
  public.hold_season_sponsorship((pg_temp.booking('Acme')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T12:00:00Z') ->> 'state',
  'held', 'an approved sponsor holds the season for checkout'
);
select is(
  public.hold_season_sponsorship((pg_temp.booking('Beta')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T12:45:00Z') ->> 'state',
  'unavailable', 'a second sponsor cannot hold a held season'
);
select throws_ok(
  $$update public.season_sponsorships set status = 'payment_pending', provider = 'fixture', hold_expires_at = '2034-02-01T13:30:00Z' where product_name = 'Beta'$$,
  '23505', 'duplicate key value violates unique constraint "season_sponsorships_one_holder_idx"',
  'the one-sponsor limit is enforced by the database, not the interface'
);
select throws_ok(
  $$update public.season_sponsorships set status = 'scheduled' where product_name = 'Gamma'$$,
  '22023', 'illegal season sponsorship transition: submitted -> scheduled', 'a request can never skip review and payment'
);

select is(
  public.hold_season_sponsorship((pg_temp.booking('Beta')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T13:01:00Z') ->> 'state',
  'held', 'a lapsed hold is released after its grace period'
);
select is((pg_temp.booking('Acme')).status_reason, 'hold_expired', 'the lapsed sponsor returns to approved with the reason recorded');

select is(
  public.confirm_season_payment('fixture', 'pay_beta', (pg_temp.booking('Beta')).id, 'chk_beta', 49900, 0, 'usd', true, true, false, '2034-02-01T13:05:00Z') ->> 'outcome',
  'scheduled', 'the verified payment schedules the holder'
);
select is(
  public.confirm_season_payment('fixture', 'pay_beta', (pg_temp.booking('Beta')).id, 'chk_beta', 49900, 0, 'USD', true, true, false, '2034-02-01T13:06:00Z') ->> 'duplicate',
  'true', 'a duplicate payment event changes nothing'
);
select is(
  public.confirm_season_payment('fixture', 'pay_acme_late', (pg_temp.booking('Acme')).id, 'chk_acme', 49900, 0, 'USD', true, true, false, '2034-02-01T13:10:00Z') ->> 'reason',
  'season_unavailable', 'a late payment never activates a second sponsor'
);
select is((pg_temp.booking('Acme')).status, 'refund_required', 'the late payment is held for refund');
select is(
  public.confirm_season_payment('fixture', 'pay_beta_short', (pg_temp.booking('Beta')).id, 'chk_beta', 45000, 0, 'USD', true, true, false, '2034-02-01T13:20:00Z') ->> 'reason',
  'amount_mismatch', 'a wrong amount is refused before anything else'
);
select is((pg_temp.booking('Beta')).status, 'scheduled', 'a mismatched payment leaves the paid booking alone');

create temporary table at_start as
select public.reconcile_season_sponsorships('2034-03-01T16:00:30Z', 24) as result;
select is(((select result ->> 'activated' from at_start))::integer, 1, 'the paid booking activates at the season start');
select is((pg_temp.booking('Beta')).delivered_from, '2034-03-01T16:00:00Z'::timestamptz, 'delivery is recorded from the season start');
select is((pg_temp.booking('Gamma')).status, 'expired', 'an unreviewed request expires when booking closes');

select public.reconcile_season_sponsorships('2034-03-08T16:00:01Z', 24);
select is((pg_temp.booking('Beta')).status, 'completed', 'the placement ends at the season end');
select is((pg_temp.booking('Beta')).delivered_until, '2034-03-08T16:00:00Z'::timestamptz, 'the delivered interval ends exactly at ends_at');

select is(
  public.admin_season_sponsorship_action((pg_temp.booking('Acme')).id, 'mark_refunded', '2034-02-02T09:00:00Z') ->> 'action',
  'mark_refunded', 'the operator confirms a completed refund'
);
select is((select outcome from public.season_sponsor_payments where payment_id = 'pay_acme_late'), 'refunded', 'the refunded payment is closed in the ledger');

select pg_temp.submit('test-sponsor-d', 'Delta', '2034-02-01T10:00:00Z');
select public.review_season_sponsorship((pg_temp.booking('Delta')).id, 'approved', 'public/delta.webp', '2034-02-01T11:00:00Z', 24);
select public.hold_season_sponsorship((pg_temp.booking('Delta')).public_id, 'fixture', true, 30, 30, 24, '2034-02-01T12:00:00Z');
select is(
  public.confirm_season_payment('fixture', 'pay_delta', (pg_temp.booking('Delta')).id, 'chk_delta', 54390, 4490, 'USD', true, true, false, '2034-02-01T12:10:00Z') ->> 'outcome',
  'scheduled', 'tax added by the processor is separated from the fixed price'
);
select is(public.record_season_refund('fixture', 'pay_delta', '2034-02-02T12:00:00Z') ->> 'status', 'refunded', 'a refund before delivery removes the booking');
select is(pg_temp.submit('test-sponsor-d', 'Echo', '2034-02-03T10:00:00Z') ->> 'state', 'submitted', 'a refunded season can be offered again');

select public.review_season_sponsorship((pg_temp.booking('Echo')).id, 'approved', 'public/echo.webp', '2034-02-03T11:00:00Z', 24);
select public.hold_season_sponsorship((pg_temp.booking('Echo')).public_id, 'fixture', true, 30, 30, 24, '2034-02-03T12:00:00Z');
select public.record_season_refund('fixture', 'pay_echo_reversed', '2034-02-03T12:01:00Z');
select is(
  public.confirm_season_payment('fixture', 'pay_echo_reversed', (pg_temp.booking('Echo')).id, 'chk_echo', 49900, 0, 'USD', true, true, false, '2034-02-03T12:02:00Z') ->> 'outcome',
  'refunded', 'a refund that arrives before its payment wins'
);
select is((pg_temp.booking('Echo')).status, 'payment_pending', 'the out-of-order payment never schedules the booking');
select is(
  public.confirm_season_payment('fixture', 'pay_echo_late', (pg_temp.booking('Echo')).id, 'chk_echo', 49900, 0, 'USD', true, true, false, '2034-04-01T17:00:00Z') ->> 'reason',
  'season_started', 'a payment after the start is refunded, never a partial week'
);

select public.record_season_dispute('fixture', 'pay_beta', 'lost', '2034-03-20T00:00:00Z');
select is((pg_temp.booking('Beta')).status_reason, 'dispute_lost', 'a lost dispute ends the booking as refunded');
select lives_ok(
  $$insert into public.payment_webhook_events (provider, provider_event_id, event_name, payload_checksum, processing_status)
    values ('dodo', 'msg_test_1', 'payment.succeeded', repeat('a', 64), 'received')$$,
  'the webhook ledger accepts Dodo events'
);

select * from finish();
rollback;
