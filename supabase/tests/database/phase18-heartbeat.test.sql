begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- The interval table itself: three bands, and the boundaries belong to the
-- slower side so a crowd sitting exactly on a threshold is not thrashed.
select is(public.presence_heartbeat_seconds(1), 20, 'one watcher beats every twenty seconds');
select is(public.presence_heartbeat_seconds(300), 20, 'three hundred is still the fast band');
select is(public.presence_heartbeat_seconds(301), 30, 'past three hundred the beat slows to thirty');
select is(public.presence_heartbeat_seconds(1000), 30, 'a thousand is still thirty');
select is(public.presence_heartbeat_seconds(1001), 40, 'past a thousand the beat slows to forty');
select is(public.presence_heartbeat_seconds(0), 20, 'an empty day keeps the fast beat');
select is(public.presence_heartbeat_seconds(null), 20, 'an unknown count keeps the fast beat');

-- The lease must always outlive two beats, or a watcher who obeys the server
-- would expire between them.
select is(public.presence_lease_ttl_seconds(20), 50, 'the fast band keeps the fifty-second lease');
select is(public.presence_lease_ttl_seconds(30), 70, 'thirty-second beats get a seventy-second lease');
select is(public.presence_lease_ttl_seconds(40), 90, 'forty-second beats get a ninety-second lease');
select ok(
  (select bool_and(public.presence_lease_ttl_seconds(hb) > 2 * hb)
   from unnest(array[20, 30, 40]) hb),
  'every lease outlives two of its own beats'
);

select function_privs_are(
  'public', 'record_presence_heartbeat_v10',
  array['uuid', 'text', 'text', 'text', 'boolean', 'timestamptz', 'integer', 'numeric', 'real', 'integer', 'text'],
  'anon', array[]::text[], 'the browser role cannot record an adaptive heartbeat'
);

select * from finish();
rollback;
