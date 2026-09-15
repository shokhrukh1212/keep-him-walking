begin;
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('public', 'supporter_contributions', 'supporter acknowledgments have a private ledger');
select has_column('public', 'supporter_contributions', 'private_email', 'supporter email is explicitly private');
select has_column('public', 'supporter_contributions', 'private_message', 'provider messages stay in the private ledger');
select is((select relrowsecurity from pg_class where oid = 'public.supporter_contributions'::regclass), true, 'supporter rows use row level security');
select is(has_table_privilege('anon', 'public.supporter_contributions', 'SELECT'), false, 'anon cannot read supporter rows');
select is(has_table_privilege('authenticated', 'public.supporter_contributions', 'SELECT'), false, 'authenticated visitors cannot read supporter rows');
select is(has_table_privilege('service_role', 'public.supporter_contributions', 'SELECT'), true, 'the server can administer supporter rows');
select is(has_function_privilege('anon', 'public.import_supporter_contributions(jsonb,timestamptz)', 'EXECUTE'), false, 'the browser cannot import provider exports');
select is(has_function_privilege('service_role', 'public.import_supporter_contributions(jsonb,timestamptz)', 'EXECUTE'), true, 'the protected server may import provider exports');

create temporary table first_import as
select public.import_supporter_contributions('[
  {"externalTransactionId":"bmc-001","occurredAt":"2034-01-01T10:00:00Z","displayName":"Imported supporter","coffeeCount":2,"isAnonymous":false,"privateEmail":"private@example.test","privateMessage":"private note"},
  {"externalTransactionId":"bmc-002","occurredAt":"2034-01-03T10:00:00Z","displayName":"Later supporter","coffeeCount":null,"isAnonymous":false}
]'::jsonb, '2034-01-04T00:00:00Z') as result;

select is((select (result ->> 'inserted')::integer from first_import), 2, 'new provider transactions are imported');
select is((select (result ->> 'duplicates')::integer from first_import), 0, 'the first import has no duplicates');
select is((public.import_supporter_contributions('[
  {"externalTransactionId":"bmc-001","occurredAt":"2034-01-01T10:00:00Z","displayName":"Changed","coffeeCount":9,"isAnonymous":false},
  {"externalTransactionId":"bmc-002","occurredAt":"2034-01-03T10:00:00Z","displayName":"Changed","coffeeCount":9,"isAnonymous":false}
]'::jsonb, '2034-01-04T01:00:00Z') ->> 'duplicates')::integer, 2, 're-imported transaction ids are deduplicated');
select is((select count(*)::integer from public.supporter_contributions), 2, 'deduplication leaves two rows');
select is((select status from public.supporter_contributions where external_transaction_id = 'bmc-001'), 'draft', 'imports are never public automatically');
select is((select private_email from public.supporter_contributions where external_transaction_id = 'bmc-001'), 'private@example.test', 'private email is retained only for admin review');
select throws_ok(
  $$select public.set_supporter_contribution_status((select id from public.supporter_contributions where external_transaction_id = 'bmc-001'), 'publish', '2034-01-04T02:00:00Z')$$,
  '55000', 'supporter acknowledgment is not approved', 'an unverified or unpermitted contribution cannot publish'
);

select lives_ok($$
  select public.save_supporter_contribution(
    (select id from public.supporter_contributions where external_transaction_id = 'bmc-001'),
    'buy_me_a_coffee', 'bmc-001', '2034-01-01T10:00:00Z', 'Imported supporter', false,
    2, 'https://x.com/imported', false, null, false, 'private@example.test', 'pay-private-1',
    'private note', true, true, '2034-01-04T03:00:00Z'
  )
$$, 'an imported row can be corrected and verified');
select is(public.set_supporter_contribution_status(
  (select id from public.supporter_contributions where external_transaction_id = 'bmc-001'),
  'publish', '2034-01-04T03:01:00Z'
), 'published', 'a verified contribution with permission can publish');

create temporary table manual_row as
select public.save_supporter_contribution(
  null, 'manual', null, '2034-01-02T10:00:00Z', 'A very long startup founder name', false,
  null, null, false, 'https://example.test/startup', true, null, null, null,
  true, true, '2034-01-04T04:00:00Z'
) as id;
select ok((select id > 0 from manual_row), 'manual entry creates a launch-independent draft');
select is(public.set_supporter_contribution_status(
  (select id from manual_row), 'publish', '2034-01-04T04:01:00Z'
), 'published', 'manual entry uses the same publication gate');

create temporary table public_page as
select public.read_published_supporters(null, null, 20) as result;
select is(jsonb_array_length((select result -> 'items' from public_page)), 2, 'the public projection contains only published rows');
select is((select result #>> '{items,0,displayName}' from public_page), 'Imported supporter', 'the public feed is chronological, oldest first');
select is((select result #>> '{items,1,displayName}' from public_page), 'A very long startup founder name', 'newer contributions are appended at the bottom');
select is((select (result #>> '{items,0,coffeeCount}')::integer from public_page), 2, 'an explicit provider coffee count is preserved');
select is((select result #>> '{items,0,xUrl}' from public_page), null::text, 'an unverified X link is not projected');
select is((select result #>> '{items,1,startupUrl}' from public_page), 'https://example.test/startup', 'a verified startup link is projected');
select is((public.read_published_supporters(null, null, 1) ->> 'hasEarlier')::boolean, true, 'the newest page reports that earlier records exist');
select is(public.read_published_supporters(null, null, 1) #>> '{items,0,displayName}', 'A very long startup founder name', 'the newest page starts at the bottom of the chronology');
select is(public.read_published_supporters(
  '2034-01-02T10:00:00Z', (select id from manual_row), 20
) #>> '{items,0,displayName}', 'Imported supporter', 'the composite cursor reads the preceding chronological page');
select is(public.set_supporter_contribution_status((select id from manual_row), 'remove', '2034-01-05T00:00:00Z'), 'removed', 'a published acknowledgment can be removed');
select is(jsonb_array_length(public.read_published_supporters(null, null, 20) -> 'items'), 1, 'removed acknowledgments disappear from the public feed');

create temporary table anonymous_row as
select public.save_supporter_contribution(
  null, 'manual', null, '2034-01-06T10:00:00Z', null, true,
  null, 'https://x.com/private_identity', true, 'https://private.example.test', true,
  null, null, null, true, true, '2034-01-06T11:00:00Z'
) as id;
select ok((select id > 0 from anonymous_row), 'an anonymous acknowledgment can be entered');
select is(public.set_supporter_contribution_status(
  (select id from anonymous_row), 'publish', '2034-01-06T11:01:00Z'
), 'published', 'an anonymous acknowledgment can publish with permission');
select is(public.read_published_supporters(null, null, 1) #>> '{items,0,displayName}', 'Anonymous supporter', 'anonymous acknowledgments use a neutral public name');
select is(public.read_published_supporters(null, null, 1) #>> '{items,0,xUrl}', null::text, 'anonymous acknowledgments never expose an X profile');
select is(public.read_published_supporters(null, null, 1) #>> '{items,0,startupUrl}', null::text, 'anonymous acknowledgments never expose a startup link');

select * from finish();
rollback;
