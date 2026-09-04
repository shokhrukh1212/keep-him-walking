begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'country_notification_opt_ins', 'notification preference table exists');
select has_table('public', 'experiment_exposures', 'privacy-safe exposure table exists');
select has_table('public', 'operational_incidents', 'incident audit table exists');
select has_table('public', 'webhook_replay_audit', 'webhook replay audit table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.country_notification_opt_ins'::regclass), 'notification preferences enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.experiment_exposures'::regclass), 'experiment exposures enforce RLS');
select is(has_table_privilege('anon', 'public.country_notification_opt_ins', 'SELECT'), false, 'anon cannot enumerate notification preferences');
select is(has_table_privilege('authenticated', 'public.operational_incidents', 'INSERT'), false, 'clients cannot forge incidents');
select is(public.set_country_notification_opt_in(repeat('a', 64), 'BG', true, '2026-09-04T00:00:00Z'), 'active', 'notification opt-in is explicit');
select is(public.set_country_notification_opt_in(repeat('a', 64), 'BG', false, '2026-09-04T01:00:00Z'), 'revoked', 'notification preference is revocable');
select is((select status from public.country_notification_opt_ins where visitor_hash = repeat('a', 64) and country_code = 'BG'), 'revoked', 'revocation persists');
select throws_ok($$select public.set_country_notification_opt_in('short', 'bad', true, now())$$, '22023', null, 'invalid preference identity fails closed');

select * from finish();
rollback;
