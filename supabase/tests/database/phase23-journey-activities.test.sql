begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000236', 'phase23-activities-test',
  'Phase 23 Activities Test', '2026-09-26T00:00:00Z', 1, 'preview',
  '2026-09-26T00:00:00Z', '2026-09-26T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000237',
  '00000000-0000-4000-8000-000000000236',
  1, 'FR', 'France', 'Paris', 'Europe/Paris',
  '2026-09-26T00:00:00Z', '2026-09-27T00:00:00Z', 'paris-v1', 'live'
);

-- Schema contract -------------------------------------------------------------

select has_column('public', 'scheduled_actions', 'variant', 'a stop names its reviewed script');
select has_column('public', 'scheduled_actions', 'occurrence_key', 'a stop names its planned occurrence');
select has_column('public', 'scheduled_actions', 'cancelled_at', 'a displaced stop is cancelled, not deleted');
select has_index(
  'public', 'scheduled_actions', 'scheduled_actions_occurrence_idx',
  'one live row per planned occurrence'
);
select has_function(
  'public', 'schedule_journey_activity',
  array[
    'uuid', 'text', 'text', 'text', 'text', 'integer', 'numeric', 'integer',
    'timestamp with time zone', 'integer', 'numeric', 'real'
  ],
  'the journey schedules its own stops'
);
select is(
  has_function_privilege(
    'anon',
    'public.schedule_journey_activity(uuid,text,text,text,text,integer,numeric,integer,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  false,
  'the browser cannot schedule a stop'
);
select is(
  has_function_privilege(
    'service_role',
    'public.schedule_journey_activity(uuid,text,text,text,text,integer,numeric,integer,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  true,
  'the server schedules stops'
);
select is(public.crowd_action_duration_seconds('wave'), 5.930::numeric, 'a crowd wave plays the whole Waving take');
select is(public.crowd_action_duration_seconds('drink'), 10.070::numeric, 'a crowd drink plays the whole Drinking take');
select is(public.crowd_action_duration_seconds('photo'), 5.200::numeric, 'a crowd photo plays the whole photo take');

-- One solo watcher -----------------------------------------------------------------

do $$ begin
  perform * from public.record_presence_heartbeat_v12(
    '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
    'active', true, '2026-09-26T00:10:00Z', 50, 1.8, 5, 600, 'FR'
  );
  perform * from public.record_presence_heartbeat_v12(
    '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
    'active', true, '2026-09-26T00:10:10Z', 50, 1.8, 5, 600, 'FR'
  );
end; $$;

create temporary table first_activity as
select * from public.schedule_journey_activity(
  '10000000-0000-4000-8000-000000000237', 'conversation:0', 'conversation', 'system',
  'paris-station-hello', 40, 20.66, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
);

select results_eq(
  $$ select out_scheduled, out_reason, out_at_active_second, out_end_active_second from first_activity $$,
  $$ values (true, 'scheduled'::text, 40, 60.66::numeric) $$,
  'a planned conversation is written ahead of every viewer'
);
select is(
  (select out_reason from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'conversation:0', 'conversation', 'system',
    'paris-station-hello', 44, 20.66, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
  )),
  'exists',
  'the same occurrence is never written twice'
);
select is(
  (select out_reason from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:0', 'drink', 'system',
    null, 20, 10.07, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
  )),
  'too_soon',
  'a stop is never scheduled where a viewer may already be'
);
select is(
  (select out_reason from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:1', 'phone', 'system',
    null, 45, 10, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
  )),
  'overlap',
  'two stops never overlap'
);
select throws_ok(
  $$ select * from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:9', 'wave', 'crowd',
    null, 200, 5.93, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
  ) $$,
  '22023',
  'journey activities come from the schedule, never the crowd',
  'the crowd cannot pose as the schedule'
);
select throws_ok(
  $$ select * from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:9', 'phone', 'system',
    null, 200, 900, 15, '2026-09-26T00:10:10Z', 50, 1.8, 5
  ) $$,
  '22023',
  'invalid activity duration',
  'a stop cannot hold the day hostage'
);
select is(
  (public.read_day_reactions(
    '10000000-0000-4000-8000-000000000237', '2026-09-26T00:10:10Z', 10
  ) #>> '{walkingClock,heldActiveSeconds}')::numeric,
  0::numeric,
  'no time is held before the first stop'
);
select ok(
  jsonb_path_exists(
    public.read_day_reactions('10000000-0000-4000-8000-000000000237', '2026-09-26T00:10:10Z', 10),
    '$.scheduled[*] ? (@.occurrenceKey == "conversation:0" && @.variant == "paris-station-hello" && @.source == "system" && @.cancelled == false)'
  ),
  'every viewer reads the upcoming stop with its script'
);

-- Distance pauses through the stop ---------------------------------------------------

do $$ begin
  perform * from public.record_presence_heartbeat_v12(
    '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
    'active', true, '2026-09-26T00:10:40Z', 50, 1.8, 5, 600, 'FR'
  );
end; $$;

create temporary table after_conversation as
select * from public.record_presence_heartbeat_v12(
  '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
  'active', true, '2026-09-26T00:11:10Z', 50, 1.8, 5, 600, 'FR'
);

select is(
  round((select out_global_distance_metres from after_conversation)::numeric, 3),
  61.675::numeric,
  'thirty watched seconds advance distance only outside the conversation'
);
select is(
  (public.read_day_reactions(
    '10000000-0000-4000-8000-000000000237', '2026-09-26T00:11:10Z', 70
  ) #>> '{walkingClock,heldActiveSeconds}')::numeric,
  20.66::numeric,
  'the walking clock holds exactly the stop'
);

-- Crowd reactions keep priority ------------------------------------------------------

do $$ begin
  perform * from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:2', 'phone', 'system',
    null, 86, 24.77, 15, '2026-09-26T00:11:10Z', 50, 1.8, 5
  );
  perform * from public.record_presence_heartbeat_v12(
    '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
    'active', true, '2026-09-26T00:11:20Z', 50, 1.8, 5, 600, 'FR'
  );
end; $$;

create temporary table priority_photo as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000237', repeat('q', 64), 'photo',
  '2026-09-26T00:11:21Z', 50
);

select is(
  (select out_scheduled_at from priority_photo),
  83,
  'a crowd reaction takes the slot of a stop nobody has started'
);
select isnt(
  (select cancelled_at from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000237' and occurrence_key = 'action:2'),
  null,
  'the displaced stop is cancelled, not deleted'
);
select is(
  public.action_overlap_seconds('10000000-0000-4000-8000-000000000237', 86, 111),
  2.2::numeric,
  'a cancelled stop holds no time'
);
select is(
  (select out_reason from public.schedule_journey_activity(
    '10000000-0000-4000-8000-000000000237', 'action:2', 'phone', 'system',
    null, 110, 24.77, 15, '2026-09-26T00:11:21Z', 50, 1.8, 5
  )),
  'scheduled',
  'the displaced occurrence can be planned again after the reaction'
);

do $$ begin
  perform * from public.record_presence_heartbeat_v12(
    '10000000-0000-4000-8000-000000000237', repeat('q', 64), repeat('7', 64),
    'active', true, '2026-09-26T00:12:00Z', 50, 1.8, 5, 600, 'FR'
  );
end; $$;

create temporary table queued_water as
select * from public.submit_reaction(
  '10000000-0000-4000-8000-000000000237', repeat('q', 64), 'water',
  '2026-09-26T00:12:01Z', 50
);

select is(
  (select out_scheduled_at from queued_water),
  135,
  'a crowd reaction queues right after a stop that is already playing'
);
select is(
  (select count(*) from public.scheduled_actions
   where country_day_id = '10000000-0000-4000-8000-000000000237'
     and occurrence_key = 'action:2' and cancelled_at is null),
  1::bigint,
  'a stop that is playing is never cut short'
);

-- Shape constraints ------------------------------------------------------------------

select throws_ok(
  $$ insert into public.scheduled_actions (
    country_day_id, kind, at_active_second, end_active_second, source, occurrence_key
  ) values (
    '10000000-0000-4000-8000-000000000237', 'wave', 500, 505.93, 'crowd', 'crowd-key'
  ) $$,
  '23514',
  'new row for relation "scheduled_actions" violates check constraint "scheduled_actions_crowd_shape_check"',
  'a crowd reaction carries no planned occurrence'
);
select throws_ok(
  $$ insert into public.scheduled_actions (
    country_day_id, kind, at_active_second, end_active_second, source
  ) values (
    '10000000-0000-4000-8000-000000000237', 'dance', 600, 605, 'system'
  ) $$,
  '23514',
  'new row for relation "scheduled_actions" violates check constraint "scheduled_actions_kind_check"',
  'only approved takes can be scheduled'
);

select * from finish();
rollback;
