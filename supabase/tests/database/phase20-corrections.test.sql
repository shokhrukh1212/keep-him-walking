begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_type('public', 'correction_category', 'correction categories are a closed enum');
select has_type('public', 'correction_status', 'moderation states are a closed enum');
select has_table('public', 'corrections', 'the private correction queue exists');
select has_column('public', 'corrections', 'body', 'the queue stores private correction text');
select has_column('public', 'corrections', 'visitor_hash', 'the queue stores anonymous contributor identity');
select is((select relrowsecurity from pg_class where oid = 'public.corrections'::regclass), true, 'corrections use row level security');
select is(has_table_privilege('anon', 'public.corrections', 'SELECT'), false, 'anon cannot read corrections');
select is(has_function_privilege('anon', 'public.submit_correction(text,text,text,public.correction_category,text,text,timestamptz)', 'EXECUTE'), false, 'anon cannot call submission directly');
select is(has_function_privilege('service_role', 'public.submit_correction(text,text,text,public.correction_category,text,text,timestamptz)', 'EXECUTE'), true, 'service role can submit');
select is(has_function_privilege('anon', 'public.moderate_correction(bigint,public.correction_status,timestamptz)', 'EXECUTE'), false, 'anon cannot moderate');
select is(has_function_privilege('service_role', 'public.moderate_correction(bigint,public.correction_status,timestamptz)', 'EXECUTE'), true, 'service role can moderate');
select has_function('public', 'read_pack_correction_contributors', array['text'], 'the distinct contributor projection exists');

select is(public.read_pack_correction_contributors('tashkent-v4'), 0::bigint, 'a pack starts with no accepted contributors');

create temporary table first_submission as select * from public.submit_correction(
  repeat('a', 64), 'tashkent-v4', 'arrival-boulevard', 'place', 'The street name needs checking.', 'us', '2034-01-01T10:00:00Z');
create temporary table second_submission as select * from public.submit_correction(
  repeat('a', 64), 'tashkent-v4', null, 'phrase', 'The emphasis belongs on the second syllable.', 'US', '2034-01-01T10:01:00Z');
create temporary table third_submission as select * from public.submit_correction(
  repeat('a', 64), 'tashkent-v4', null, 'art', 'The paving colour is too cool.', 'US', '2034-01-01T10:02:00Z');
create temporary table limited_submission as select * from public.submit_correction(
  repeat('a', 64), 'tashkent-v4', null, 'other', 'This fourth note must be refused.', 'US', '2034-01-01T10:03:00Z');

select is((select out_rate_limited from first_submission), false, 'the first correction is accepted');
select is((select out_rate_limited from second_submission), false, 'the second correction is accepted');
select is((select out_rate_limited from third_submission), false, 'the third correction is accepted');
select is((select out_rate_limited from limited_submission), true, 'the fourth correction in one hour is refused');
select is((select count(*) from public.corrections), 3::bigint, 'a rate-limited body is never stored');
select is((select country_code::text from public.corrections order by id limit 1), 'US', 'country code is normalized without storing an IP');

create temporary table other_submission as select * from public.submit_correction(
  repeat('b', 64), 'tashkent-v4', null, 'dialogue', 'A second contributor offers a wording.', 'UZ', '2034-01-01T10:04:00Z');
do $$ begin
  perform * from public.moderate_correction((select out_id from first_submission), 'accepted', '2034-01-01T11:00:00Z');
  perform * from public.moderate_correction((select out_id from second_submission), 'accepted', '2034-01-01T11:00:01Z');
  perform * from public.moderate_correction((select out_id from other_submission), 'accepted', '2034-01-01T11:00:02Z');
end $$;
select is(public.read_pack_correction_contributors('tashkent-v4'), 2::bigint, 'accepted corrections count distinct visitors');

do $$ begin perform * from public.moderate_correction((select out_id from first_submission), 'rejected', '2034-01-01T11:01:00Z'); end $$;
select is(public.read_pack_correction_contributors('tashkent-v4'), 2::bigint, 'one remaining acceptance keeps the contributor counted');
do $$ begin perform * from public.moderate_correction((select out_id from second_submission), 'rejected', '2034-01-01T11:01:01Z'); end $$;
select is(public.read_pack_correction_contributors('tashkent-v4'), 1::bigint, 'rejecting the last acceptance removes that contributor');
do $$ begin perform * from public.moderate_correction((select out_id from second_submission), 'rejected', '2034-01-01T11:01:02Z'); end $$;
select is(public.read_pack_correction_contributors('tashkent-v4'), 1::bigint, 'repeated moderation is idempotent');

select throws_ok(
  $$insert into public.corrections (pack_id, category, body, visitor_hash) values ('tashkent-v4', 'other', repeat('x', 281), repeat('z', 64))$$,
  '23514', null, 'the database rejects correction text above 280 characters');

select * from finish();
rollback;
