begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000130', 'phase13-outcomes-test',
  'Phase 13 Outcomes Test', '2032-01-01T16:00:00Z', 2, 'preview',
  '2032-01-01T16:00:00Z', '2032-01-01T16:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  (
    '10000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000130',
    1, 'GE', 'Georgia', 'Tbilisi', 'Asia/Tbilisi',
    '2032-01-01T16:00:00Z', '2032-01-02T16:00:00Z', 'tbilisi-v1', 'live'
  ),
  (
    '10000000-0000-4000-8000-000000000132',
    '00000000-0000-4000-8000-000000000130',
    2, 'AM', 'Armenia', 'Yerevan', 'Asia/Yerevan',
    '2032-01-02T16:00:00Z', '2032-01-03T16:00:00Z', 'yerevan-v1', 'scheduled'
  );

insert into public.journey_runtime (
  country_day_id, last_accounted_at, active_viewers, peak_active_viewers,
  global_active_seconds, global_steps, global_distance_metres, pace_rate
) values
  ('10000000-0000-4000-8000-000000000131', '2032-01-02T16:00:00Z', 0, 7, 7200, 12960, 9000, 1),
  ('10000000-0000-4000-8000-000000000132', '2032-01-02T16:00:00Z', 0, 0, 0, 0, 0, 1);

select has_column('public', 'journey_runtime', 'peak_active_viewers', 'runtime stores the exact peak');
select has_column('public', 'day_outcomes', 'top_countries', 'outcomes preserve the final top five');
select has_function('public', 'record_presence_heartbeat_v8', array['uuid','text','text','text','boolean','timestamp with time zone','integer','numeric','real','integer','text'], 'v8 heartbeat records the peak');
select has_function('public', 'finalize_day_outcome', array['uuid','timestamp with time zone','integer','numeric','real'], 'one ended day can be finalized');
select has_function('public', 'reconcile_phase2_state_v2', array['timestamp with time zone','integer','numeric','real'], 'rollover reconciliation finalizes outcomes');
select is(has_function_privilege('anon', 'public.finalize_day_outcome(uuid,timestamptz,integer,numeric,real)', 'EXECUTE'), false, 'anon cannot finalize an outcome');
select is(has_function_privilege('service_role', 'public.finalize_day_outcome(uuid,timestamptz,integer,numeric,real)', 'EXECUTE'), true, 'service_role can finalize an outcome');
select is((select public from storage.buckets where id = 'khw-recaps'), true, 'the recap bucket is public');

create temporary table heartbeat_result as
select * from public.record_presence_heartbeat_v8(
  '10000000-0000-4000-8000-000000000132',
  repeat('a', 64), repeat('b', 64), 'active', true,
  '2032-01-02T16:00:01Z', 50, 1.8, 5, 600, 'AM'
);
select is((select out_active_viewers from heartbeat_result), 1::bigint, 'v8 returns the exact live watcher count');
select is((select peak_active_viewers from public.journey_runtime where country_day_id = '10000000-0000-4000-8000-000000000132'), 1, 'v8 persists that count as the peak');

insert into public.step_buckets (country_day_id, bucket_start, active_viewers, contributed_viewer_seconds, calculated_steps)
values ('10000000-0000-4000-8000-000000000131', '2032-01-02T15:59:00Z', 6, 60, 108);
insert into public.visitor_day_contributions (country_day_id, visitor_hash, active_seconds, first_contributed_at, last_contributed_at, expires_at) values
  ('10000000-0000-4000-8000-000000000131', repeat('c', 64), 90, '2032-01-01T16:01:00Z', '2032-01-01T16:02:30Z', '2033-01-01T00:00:00Z'),
  ('10000000-0000-4000-8000-000000000131', repeat('d', 64), 30, '2032-01-01T16:03:00Z', '2032-01-01T16:03:30Z', '2033-01-01T00:00:00Z');
insert into public.country_day_watch (country_day_id, country_code, watch_seconds, peak_watchers) values
  ('10000000-0000-4000-8000-000000000131', 'GE', 300, 4),
  ('10000000-0000-4000-8000-000000000131', 'US', 100, 2),
  ('10000000-0000-4000-8000-000000000131', 'ZZ', 50, 1);

select public.finalize_day_outcome('10000000-0000-4000-8000-000000000131', '2032-01-02T16:00:01Z', 50, 1.8, 5);

select is((select distance_metres from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 9000::double precision, 'the final authoritative distance is stored');
select is((select landmark_reached from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), true, 'the landmark stamp follows final distance');
select is((select marathon from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), false, 'a sub-marathon day is not gold');
select is((select peak_watchers from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 7, 'the exact peak is frozen');
select is((select unique_watchers from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 2, 'unique contributing watchers are counted once');
select is((select countries_count from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 2, 'unknown country is excluded from the country count');
select is((select top_country from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 'GE'::char(2), 'the longest-carrying country wins');
select is((select jsonb_array_length(top_countries) from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 2, 'the final country ranking is preserved');

update public.journey_runtime set global_distance_metres = 50000 where country_day_id = '10000000-0000-4000-8000-000000000131';
select public.finalize_day_outcome('10000000-0000-4000-8000-000000000131', '2032-01-02T16:00:02Z', 50, 1.8, 5);
select is((select distance_metres from public.day_outcomes where country_day_id = '10000000-0000-4000-8000-000000000131'), 9000::double precision, 'an applied outcome is immutable');

create temporary table reconciliation as
select public.reconcile_phase2_state_v2('2032-01-02T16:00:02Z', 50, 1.8, 5) as payload;
select is((select (payload ->> 'finalizedOutcomes')::integer from reconciliation), 0, 'reconciliation does not replace an existing outcome');
select is((select payload #>> '{recapDays,0,dayNumber}' from reconciliation), '1', 'reconciliation requests the missing stored recap');
select is((select status from public.country_days where id = '10000000-0000-4000-8000-000000000131'), 'completed', 'the original status reconciliation still runs');

select * from finish();
rollback;
