alter table public.journeys enable row level security;
alter table public.country_days enable row level security;
alter table public.story_events enable row level security;
alter table public.votes enable row level security;
alter table public.vote_options enable row level security;
alter table public.ballots enable row level security;
alter table public.step_buckets enable row level security;
alter table public.journey_runtime enable row level security;
alter table public.presence_leases enable row level security;
alter table public.mutation_rate_limits enable row level security;

create or replace function public.record_presence_heartbeat(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_session_hash text,
  p_state text,
  p_scene_ready boolean,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric
)
returns table (
  out_active_viewers bigint,
  out_global_steps bigint,
  out_visitor_active_seconds numeric,
  out_accounted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.journey_runtime%rowtype;
  v_effective_now timestamptz;
  v_active_until timestamptz;
  v_delta_seconds numeric(18,3) := 0;
  v_session_seconds numeric(18,3) := 0;
  v_existing public.presence_leases%rowtype;
  v_active_viewers bigint := 0;
  v_global_steps bigint := 0;
  v_bucket_start timestamptz;
begin
  if p_state not in ('active', 'inactive', 'observe') then
    raise exception 'invalid presence state' using errcode = '22023';
  end if;
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;
  if p_steps_per_second <= 0 or p_steps_per_second > 10 then
    raise exception 'invalid step rate' using errcode = '22023';
  end if;
  if not exists (select 1 from public.country_days cd where cd.id = p_country_day_id) then
    raise exception 'unknown country day' using errcode = '22023';
  end if;

  insert into public.journey_runtime (
    country_day_id,
    last_accounted_at,
    active_viewers,
    global_active_seconds,
    global_steps
  ) values (p_country_day_id, p_now, 0, 0, 0)
  on conflict (country_day_id) do nothing;

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  v_effective_now := greatest(p_now, v_runtime.last_accounted_at);

  select max(pl.last_seen_at + make_interval(secs => p_ttl_seconds))
  into v_active_until
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_runtime.last_accounted_at;

  if v_active_until is not null then
    v_delta_seconds := greatest(
      0,
      extract(epoch from least(v_effective_now, v_active_until) - v_runtime.last_accounted_at)
    );
  end if;

  if p_state <> 'observe' then
    if p_session_hash is null or p_visitor_hash is null then
      raise exception 'session and visitor hashes are required' using errcode = '22023';
    end if;

    select * into v_existing
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.session_hash = p_session_hash;

    if found then
      v_session_seconds := v_existing.active_seconds;
      if v_existing.visible and v_existing.scene_ready then
        v_session_seconds := v_session_seconds + greatest(
          0,
          least(
            extract(epoch from v_effective_now - v_existing.last_seen_at),
            p_ttl_seconds::numeric
          )
        );
      end if;
    end if;

    insert into public.presence_leases (
      country_day_id,
      session_hash,
      visitor_hash,
      last_seen_at,
      visible,
      scene_ready,
      active_seconds
    ) values (
      p_country_day_id,
      p_session_hash,
      p_visitor_hash,
      v_effective_now,
      p_state = 'active',
      p_scene_ready,
      v_session_seconds
    )
    on conflict (country_day_id, session_hash) do update set
      visitor_hash = excluded.visitor_hash,
      last_seen_at = excluded.last_seen_at,
      visible = excluded.visible,
      scene_ready = excluded.scene_ready,
      active_seconds = excluded.active_seconds;
  end if;

  delete from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.last_seen_at < v_effective_now - interval '1 day';

  select count(distinct pl.visitor_hash)
  into v_active_viewers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_effective_now;

  v_global_steps := floor(
    (v_runtime.global_active_seconds + v_delta_seconds) * p_steps_per_second
  );

  update public.journey_runtime set
    last_accounted_at = v_effective_now,
    active_viewers = v_active_viewers,
    global_active_seconds = global_active_seconds + v_delta_seconds,
    global_steps = v_global_steps,
    updated_at = v_effective_now
  where country_day_id = p_country_day_id;

  if v_delta_seconds > 0 then
    v_bucket_start := date_trunc('minute', v_effective_now);
    insert into public.step_buckets (
      country_day_id,
      bucket_start,
      active_viewers,
      contributed_viewer_seconds,
      calculated_steps,
      updated_at
    ) values (
      p_country_day_id,
      v_bucket_start,
      v_active_viewers,
      v_delta_seconds,
      floor(v_delta_seconds * p_steps_per_second),
      v_effective_now
    )
    on conflict (country_day_id, bucket_start) do update set
      active_viewers = excluded.active_viewers,
      contributed_viewer_seconds = public.step_buckets.contributed_viewer_seconds + excluded.contributed_viewer_seconds,
      calculated_steps = floor(
        (public.step_buckets.contributed_viewer_seconds + excluded.contributed_viewer_seconds) * p_steps_per_second
      ),
      updated_at = excluded.updated_at;
  end if;

  if p_state <> 'observe' then
    select pl.active_seconds into v_session_seconds
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.session_hash = p_session_hash;
  end if;

  return query select
    v_active_viewers,
    v_global_steps,
    coalesce(v_session_seconds, 0),
    v_effective_now;
end;
$$;

create or replace function public.consume_mutation_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit configuration' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.mutation_rate_limits (
    key_hash,
    action,
    window_start,
    request_count,
    expires_at
  ) values (
    p_key_hash,
    p_action,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (key_hash, action, window_start) do update set
    request_count = public.mutation_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.mutation_rate_limits where expires_at < p_now;
  return v_count <= p_limit;
end;
$$;

create or replace function public.submit_phase1_ballot(
  p_vote_id uuid,
  p_option_id uuid,
  p_visitor_hash text,
  p_now timestamptz
)
returns table (
  out_accepted boolean,
  out_option_id uuid,
  out_idempotent boolean,
  out_total_ballots bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.votes%rowtype;
  v_existing_option uuid;
  v_inserted_rows integer := 0;
  v_total bigint;
begin
  select * into v_vote from public.votes v where v.id = p_vote_id for update;
  if not found or v_vote.status <> 'open' or p_now < v_vote.opens_at or p_now >= v_vote.closes_at then
    raise exception 'vote is not open' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vote_options vo
    where vo.id = p_option_id and vo.vote_id = p_vote_id
  ) then
    raise exception 'option does not belong to vote' using errcode = '22023';
  end if;

  select b.option_id into v_existing_option
  from public.ballots b
  where b.vote_id = p_vote_id and b.voter_hash = p_visitor_hash;

  if found and v_existing_option <> p_option_id then
    return query select false, v_existing_option, false, count(*)
      from public.ballots b where b.vote_id = p_vote_id;
    return;
  end if;

  if not found then
    insert into public.ballots (vote_id, voter_hash, option_id, created_at)
    values (p_vote_id, p_visitor_hash, p_option_id, p_now)
    on conflict (vote_id, voter_hash) do nothing;
    get diagnostics v_inserted_rows = row_count;
  end if;

  select count(*) into v_total from public.ballots b where b.vote_id = p_vote_id;
  return query select true, p_option_id, v_inserted_rows = 0, v_total;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on function public.record_presence_heartbeat(uuid, text, text, text, boolean, timestamptz, integer, numeric) from public, anon, authenticated;
revoke all on function public.consume_mutation_rate_limit(text, text, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.submit_phase1_ballot(uuid, uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.record_presence_heartbeat(uuid, text, text, text, boolean, timestamptz, integer, numeric) to service_role;
grant execute on function public.consume_mutation_rate_limit(text, text, integer, integer, timestamptz) to service_role;
grant execute on function public.submit_phase1_ballot(uuid, uuid, text, timestamptz) to service_role;
