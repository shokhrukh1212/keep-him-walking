-- Paris relaunch: an explicit business lifecycle, undated waiting plan, journey-scoped
-- name vote and waiting reactions. Existing journey/runtime records remain intact.

alter table public.journeys alter column starts_at drop not null;
alter table public.journeys
  add column lifecycle_state text,
  add column scheduled_start_at timestamptz,
  add column launched_at timestamptz,
  add column ended_at timestamptz,
  add column schedule_revision integer not null default 0 check (schedule_revision >= 0);

update public.journeys j
set lifecycle_state = case
  when j.status = 'completed' then 'ended'
  when j.status = 'active' then 'live'
  when coalesce(j.launch_at, j.starts_at) > now() then 'scheduled'
  else 'waiting'
end,
scheduled_start_at = case when coalesce(j.launch_at, j.starts_at) > now() then coalesce(j.launch_at, j.starts_at) end,
launched_at = case when j.status in ('active', 'completed') then j.starts_at end,
ended_at = case when j.status = 'completed' then coalesce(j.ends_at, j.updated_at, now()) end;

alter table public.journeys
  alter column lifecycle_state set default 'waiting',
  alter column lifecycle_state set not null,
  add constraint journeys_lifecycle_state_check
    check (lifecycle_state in ('waiting', 'scheduled', 'live', 'ended')),
  add constraint journeys_lifecycle_dates_check check (
    (lifecycle_state = 'waiting' and scheduled_start_at is null)
    or (lifecycle_state = 'scheduled' and scheduled_start_at is not null)
    or (lifecycle_state = 'live' and launched_at is not null and ends_at is not null)
    or (lifecycle_state = 'ended' and ended_at is not null)
  );

create index journeys_lifecycle_idx on public.journeys (lifecycle_state, scheduled_start_at);

create table public.journey_day_plans (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 366),
  country_code char(2) not null,
  country_name text not null check (char_length(country_name) between 2 and 80),
  city_name text not null check (char_length(city_name) between 2 and 80),
  time_zone text not null check (char_length(time_zone) between 3 and 80),
  scene_pack_id text not null check (scene_pack_id ~ '^[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$'),
  story_summary text,
  primary key (journey_id, day_number)
);

create table public.journey_admin_events (
  id bigint generated always as identity primary key,
  journey_id uuid not null references public.journeys(id) on delete restrict,
  action text not null check (action in (
    'prepared', 'waiting', 'scheduled', 'schedule_cancelled', 'started', 'ended',
    'name_vote_opened', 'name_vote_closed'
  )),
  actor text not null check (char_length(actor) between 2 and 80),
  from_state text,
  to_state text,
  effective_at timestamptz,
  schedule_revision integer not null,
  occurred_at timestamptz not null
);
create index journey_admin_events_journey_idx on public.journey_admin_events (journey_id, occurred_at desc);

create table public.journey_name_votes (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null unique references public.journeys(id) on delete cascade,
  question text not null,
  status text not null check (status in ('draft', 'open', 'closed')),
  result_option_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.journey_name_vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.journey_name_votes(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 40),
  display_order integer not null check (display_order >= 0),
  unique (vote_id, display_order),
  unique (vote_id, label)
);

alter table public.journey_name_votes
  add constraint journey_name_votes_result_fk
  foreign key (result_option_id) references public.journey_name_vote_options(id) on delete set null;

create table public.journey_name_ballots (
  vote_id uuid not null references public.journey_name_votes(id) on delete cascade,
  voter_hash text not null check (length(voter_hash) = 64),
  option_id uuid not null references public.journey_name_vote_options(id) on delete restrict,
  created_at timestamptz not null,
  primary key (vote_id, voter_hash)
);
create index journey_name_ballots_option_idx on public.journey_name_ballots (vote_id, option_id);

create table public.journey_waiting_actions (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  kind text not null check (kind in ('wave', 'water', 'photo')),
  visitor_hash text not null check (length(visitor_hash) = 64),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null,
  check (ends_at > starts_at)
);
create index journey_waiting_actions_recent_idx on public.journey_waiting_actions (journey_id, starts_at desc);

create or replace function public.prepare_paris_relaunch(
  p_plan jsonb,
  p_archive_current boolean,
  p_actor text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := nullif(btrim(p_plan #>> '{journey,slug}'), '');
  v_title text := nullif(btrim(p_plan #>> '{journey,title}'), '');
  v_days jsonb := p_plan -> 'days';
  v_existing public.journeys%rowtype;
  v_current public.journeys%rowtype;
  v_journey_id uuid;
  v_day jsonb;
  v_option text;
  v_vote_id uuid;
  v_order integer := 0;
begin
  if p_now is null or nullif(btrim(p_actor), '') is null
    or v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or v_title is null or char_length(v_title) > 120
    or jsonb_typeof(v_days) is distinct from 'array' or jsonb_array_length(v_days) <> 14
    or p_plan #>> '{days,0,cityName}' <> 'Paris'
    or p_plan #>> '{days,0,countryCode}' <> 'FR' then
    raise exception 'invalid Paris relaunch plan' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('paris-relaunch:' || v_slug));
  select * into v_existing from public.journeys j where j.slug = v_slug for update;
  if found then
    return jsonb_build_object('state', 'exists', 'journeyId', v_existing.id,
      'lifecycleState', v_existing.lifecycle_state);
  end if;

  select * into v_current from public.journeys j
  where j.lifecycle_state in ('live', 'scheduled')
  order by coalesce(j.launched_at, j.scheduled_start_at, j.created_at) desc limit 1 for update;
  if found and not p_archive_current then
    raise exception 'another journey must be archived explicitly' using errcode = '55000';
  end if;
  if found then
    update public.journeys j set lifecycle_state = 'ended', status = 'completed',
      scheduled_start_at = null, ended_at = p_now, ends_at = coalesce(j.ends_at, p_now), updated_at = p_now
    where j.id = v_current.id;
    insert into public.journey_admin_events
      (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
    values (v_current.id, 'ended', btrim(p_actor), v_current.lifecycle_state, 'ended', p_now,
      v_current.schedule_revision, p_now);
  end if;

  insert into public.journeys (
    slug, title, starts_at, launch_at, ends_at, total_days, season_number,
    rollover_utc_hour, status, phase2_enabled, story_time_scale, traveler_name,
    lifecycle_state, created_at, updated_at
  ) values (
    v_slug, v_title, null, null, null, 14,
    coalesce((select max(j.season_number) + 1 from public.journeys j), 1),
    19, 'draft', true, 1, null, 'waiting', p_now, p_now
  ) returning id into v_journey_id;

  for v_day in select value from jsonb_array_elements(v_days) loop
    insert into public.journey_day_plans (
      journey_id, day_number, country_code, country_name, city_name, time_zone,
      scene_pack_id, story_summary
    ) values (
      v_journey_id, (v_day ->> 'dayNumber')::integer, upper(v_day ->> 'countryCode'),
      btrim(v_day ->> 'countryName'), btrim(v_day ->> 'cityName'), btrim(v_day ->> 'timeZone'),
      btrim(v_day ->> 'scenePackId'), nullif(btrim(v_day ->> 'storySummary'), '')
    );
  end loop;

  insert into public.journey_name_votes
    (journey_id, question, status, opened_at, created_at, updated_at)
  values (v_journey_id, 'What should we call him?', 'open', p_now, p_now, p_now)
  returning id into v_vote_id;
  foreach v_option in array array['Milo','Nur','Sami','Bek'] loop
    insert into public.journey_name_vote_options (vote_id, label, display_order)
    values (v_vote_id, v_option, v_order);
    v_order := v_order + 1;
  end loop;

  insert into public.journey_admin_events
    (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
  values (v_journey_id, 'prepared', btrim(p_actor), null, 'waiting', null, 0, p_now);

  return jsonb_build_object('state', 'created', 'journeyId', v_journey_id,
    'lifecycleState', 'waiting', 'voteId', v_vote_id);
end;
$$;

create or replace function public.resolve_journey_name_vote(p_journey_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.journey_name_votes%rowtype;
  v_winner record;
begin
  select * into v_vote from public.journey_name_votes v
  where v.journey_id = p_journey_id for update;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  if v_vote.status = 'closed' then
    return jsonb_build_object('state', 'closed', 'optionId', v_vote.result_option_id);
  end if;
  select o.id, o.label, count(b.option_id) as ballots into v_winner
  from public.journey_name_vote_options o
  left join public.journey_name_ballots b on b.option_id = o.id
  where o.vote_id = v_vote.id
  group by o.id, o.label, o.display_order
  order by count(b.option_id) desc, o.display_order asc limit 1;
  update public.journey_name_votes set status = 'closed', result_option_id = v_winner.id,
    closed_at = p_now, updated_at = p_now where id = v_vote.id;
  update public.journeys set traveler_name = v_winner.label, updated_at = p_now where id = p_journey_id;
  return jsonb_build_object('state', 'closed', 'optionId', v_winner.id,
    'label', v_winner.label, 'ballots', v_winner.ballots);
end;
$$;

create or replace function public.activate_relaunch_journey(
  p_journey_id uuid,
  p_effective_start timestamptz,
  p_actor text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_plan public.journey_day_plans%rowtype;
  v_day_id uuid;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  select * into v_journey from public.journeys j where j.id = p_journey_id for update;
  if not found then raise exception 'journey not found' using errcode = 'P0002'; end if;
  if v_journey.lifecycle_state = 'live' then
    return jsonb_build_object('state', 'live', 'journeyId', v_journey.id, 'startsAt', v_journey.launched_at);
  end if;
  if v_journey.lifecycle_state not in ('waiting', 'scheduled') or p_effective_start is null
    or (select count(*) from public.journey_day_plans d where d.journey_id = p_journey_id) <> 14 then
    raise exception 'journey cannot start' using errcode = '55000';
  end if;

  update public.journeys set lifecycle_state = 'live', status = 'active', starts_at = p_effective_start,
    launch_at = p_effective_start, scheduled_start_at = null, launched_at = p_effective_start,
    ends_at = p_effective_start + interval '14 days', ended_at = null,
    rollover_utc_hour = extract(hour from p_effective_start at time zone 'UTC')::integer,
    updated_at = p_now where id = p_journey_id;

  for v_plan in select * from public.journey_day_plans d
    where d.journey_id = p_journey_id order by d.day_number loop
    v_day_start := p_effective_start + make_interval(days => v_plan.day_number - 1);
    v_day_end := v_day_start + interval '1 day';
    insert into public.country_days (
      journey_id, day_number, country_code, country_name, city_name, time_zone,
      starts_at, ends_at, scene_pack_id, status, story_summary, created_at, updated_at
    ) values (
      p_journey_id, v_plan.day_number, v_plan.country_code, v_plan.country_name,
      v_plan.city_name, v_plan.time_zone, v_day_start, v_day_end, v_plan.scene_pack_id,
      case when v_day_end <= p_now then 'completed' when v_day_start <= p_now then 'live' else 'scheduled' end,
      v_plan.story_summary, p_now, p_now
    ) on conflict (journey_id, day_number) do update set
      starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = excluded.status,
      updated_at = excluded.updated_at
    returning id into v_day_id;
    insert into public.journey_runtime (country_day_id, last_accounted_at, updated_at)
    values (v_day_id, greatest(v_day_start, least(p_now, v_day_end)), p_now)
    on conflict (country_day_id) do nothing;
  end loop;

  perform public.resolve_journey_name_vote(p_journey_id, p_now);
  insert into public.journey_admin_events
    (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
  values (p_journey_id, 'started', btrim(p_actor), v_journey.lifecycle_state, 'live',
    p_effective_start, v_journey.schedule_revision, p_now);
  return jsonb_build_object('state', 'live', 'journeyId', p_journey_id,
    'startsAt', p_effective_start, 'endsAt', p_effective_start + interval '14 days');
end;
$$;

create or replace function public.set_relaunch_journey_state(
  p_journey_id uuid,
  p_action text,
  p_scheduled_start timestamptz,
  p_actor text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_revision integer;
begin
  select * into v_journey from public.journeys j where j.id = p_journey_id for update;
  if not found then raise exception 'journey not found' using errcode = 'P0002'; end if;
  if p_action = 'start' then
    return public.activate_relaunch_journey(p_journey_id, p_now, p_actor, p_now);
  end if;
  if p_action = 'schedule' then
    if v_journey.lifecycle_state not in ('waiting', 'scheduled') or p_scheduled_start <= p_now then
      raise exception 'invalid launch schedule' using errcode = '22023';
    end if;
    v_revision := v_journey.schedule_revision + 1;
    update public.journeys set lifecycle_state = 'scheduled', scheduled_start_at = p_scheduled_start,
      schedule_revision = v_revision, updated_at = p_now where id = p_journey_id;
    insert into public.journey_admin_events
      (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
    values (p_journey_id, 'scheduled', btrim(p_actor), v_journey.lifecycle_state, 'scheduled',
      p_scheduled_start, v_revision, p_now);
    return jsonb_build_object('state', 'scheduled', 'scheduledStartAt', p_scheduled_start, 'revision', v_revision);
  end if;
  if p_action in ('waiting', 'cancel') then
    if v_journey.lifecycle_state not in ('waiting', 'scheduled') then
      raise exception 'a live journey cannot return to waiting' using errcode = '55000';
    end if;
    v_revision := v_journey.schedule_revision + 1;
    update public.journeys set lifecycle_state = 'waiting', scheduled_start_at = null,
      schedule_revision = v_revision, updated_at = p_now where id = p_journey_id;
    insert into public.journey_admin_events
      (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
    values (p_journey_id, case when p_action = 'cancel' then 'schedule_cancelled' else 'waiting' end,
      btrim(p_actor), v_journey.lifecycle_state, 'waiting', null, v_revision, p_now);
    return jsonb_build_object('state', 'waiting', 'revision', v_revision);
  end if;
  raise exception 'unknown journey action' using errcode = '22023';
end;
$$;

create or replace function public.reconcile_relaunch_journeys(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey record;
  v_started integer := 0;
  v_ended integer := 0;
begin
  for v_journey in select j.id, j.ends_at, j.schedule_revision from public.journeys j
    where j.lifecycle_state = 'live' and j.ends_at <= p_now for update loop
    update public.journeys set lifecycle_state = 'ended', status = 'completed', ended_at = ends_at,
      updated_at = p_now where id = v_journey.id;
    update public.country_days set status = 'completed', updated_at = p_now
      where journey_id = v_journey.id and status <> 'completed';
    insert into public.journey_admin_events
      (journey_id, action, actor, from_state, to_state, effective_at, schedule_revision, occurred_at)
    values (v_journey.id, 'ended', 'scheduler', 'live', 'ended', v_journey.ends_at,
      v_journey.schedule_revision, p_now);
    v_ended := v_ended + 1;
  end loop;
  for v_journey in select j.id, j.scheduled_start_at from public.journeys j
    where j.lifecycle_state = 'scheduled' and j.scheduled_start_at <= p_now order by j.scheduled_start_at for update loop
    perform public.activate_relaunch_journey(v_journey.id, v_journey.scheduled_start_at, 'scheduler', p_now);
    v_started := v_started + 1;
  end loop;
  return jsonb_build_object('started', v_started, 'ended', v_ended);
end;
$$;

create or replace function public.submit_journey_name_ballot(
  p_vote_id uuid,
  p_option_id uuid,
  p_voter_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.journey_name_votes%rowtype;
  v_total bigint;
begin
  if length(p_voter_hash) <> 64 then raise exception 'invalid voter' using errcode = '22023'; end if;
  select * into v_vote from public.journey_name_votes v where v.id = p_vote_id for update;
  if not found or v_vote.status <> 'open' then raise exception 'vote is not open' using errcode = '55000'; end if;
  if not exists (select 1 from public.journey_name_vote_options o where o.id = p_option_id and o.vote_id = p_vote_id) then
    raise exception 'invalid option' using errcode = '22023';
  end if;
  insert into public.journey_name_ballots (vote_id, voter_hash, option_id, created_at)
  values (p_vote_id, p_voter_hash, p_option_id, p_now)
  on conflict (vote_id, voter_hash) do update set option_id = excluded.option_id, created_at = excluded.created_at;
  select count(*) into v_total from public.journey_name_ballots b where b.vote_id = p_vote_id;
  return jsonb_build_object('state', 'accepted', 'voteId', p_vote_id,
    'optionId', p_option_id, 'totalBallots', v_total);
end;
$$;

create or replace function public.submit_waiting_reaction(
  p_journey_id uuid,
  p_kind text,
  p_visitor_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_last timestamptz;
  v_start timestamptz;
  v_id uuid;
begin
  if p_kind not in ('wave', 'water', 'photo') or length(p_visitor_hash) <> 64 then
    raise exception 'invalid waiting reaction' using errcode = '22023';
  end if;
  select * into v_journey from public.journeys j where j.id = p_journey_id for update;
  if not found or v_journey.lifecycle_state not in ('waiting', 'scheduled') then
    raise exception 'journey is not waiting' using errcode = '55000';
  end if;
  select max(a.created_at) into v_last from public.journey_waiting_actions a
    where a.journey_id = p_journey_id and a.visitor_hash = p_visitor_hash;
  if v_last is not null and v_last > p_now - interval '5 seconds' then
    raise exception 'reaction rate limited' using errcode = '55000';
  end if;
  select greatest(p_now, coalesce(max(a.ends_at), p_now)) into v_start
    from public.journey_waiting_actions a where a.journey_id = p_journey_id and a.ends_at > p_now;
  insert into public.journey_waiting_actions (journey_id, kind, visitor_hash, starts_at, ends_at, created_at)
  values (p_journey_id, p_kind, p_visitor_hash, v_start, v_start + interval '6 seconds', p_now)
  returning id into v_id;
  return jsonb_build_object('state', 'scheduled', 'id', v_id, 'kind', p_kind,
    'startsAt', v_start, 'endsAt', v_start + interval '6 seconds');
end;
$$;

alter table public.journey_day_plans enable row level security;
alter table public.journey_admin_events enable row level security;
alter table public.journey_name_votes enable row level security;
alter table public.journey_name_vote_options enable row level security;
alter table public.journey_name_ballots enable row level security;
alter table public.journey_waiting_actions enable row level security;

revoke all on public.journey_day_plans, public.journey_admin_events,
  public.journey_name_votes, public.journey_name_vote_options,
  public.journey_name_ballots, public.journey_waiting_actions from anon, authenticated;
revoke all on function public.prepare_paris_relaunch(jsonb, boolean, text, timestamptz),
  public.resolve_journey_name_vote(uuid, timestamptz),
  public.activate_relaunch_journey(uuid, timestamptz, text, timestamptz),
  public.set_relaunch_journey_state(uuid, text, timestamptz, text, timestamptz),
  public.reconcile_relaunch_journeys(timestamptz),
  public.submit_journey_name_ballot(uuid, uuid, text, timestamptz),
  public.submit_waiting_reaction(uuid, text, text, timestamptz) from public, anon, authenticated;

grant select on public.journey_day_plans, public.journey_admin_events,
  public.journey_name_votes, public.journey_name_vote_options,
  public.journey_name_ballots, public.journey_waiting_actions to service_role;
grant execute on function public.prepare_paris_relaunch(jsonb, boolean, text, timestamptz),
  public.resolve_journey_name_vote(uuid, timestamptz),
  public.activate_relaunch_journey(uuid, timestamptz, text, timestamptz),
  public.set_relaunch_journey_state(uuid, text, timestamptz, text, timestamptz),
  public.reconcile_relaunch_journeys(timestamptz),
  public.submit_journey_name_ballot(uuid, uuid, text, timestamptz),
  public.submit_waiting_reaction(uuid, text, text, timestamptz) to service_role;
