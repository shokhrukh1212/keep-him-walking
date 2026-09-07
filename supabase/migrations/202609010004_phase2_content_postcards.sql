-- Phase 2 content clock, contribution eligibility, and opaque postcards.
-- Additive by design: no Phase 1/1.5 journey or schedule row is mutated here.

alter table public.journeys
  add column real_time_anchor_at timestamptz,
  add column story_time_anchor_at timestamptz,
  add column story_time_scale numeric(10,3) not null default 1
    check (story_time_scale >= 1 and story_time_scale <= 144),
  add column phase2_enabled boolean not null default false;

alter table public.journeys add constraint journeys_rehearsal_clock_guard check (
  story_time_scale = 1
  or (
    status in ('draft', 'preview')
    and real_time_anchor_at is not null
    and story_time_anchor_at is not null
  )
);

create or replace function public.journey_story_now(
  p_journey_id uuid,
  p_real_now timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when j.real_time_anchor_at is null or j.story_time_anchor_at is null then p_real_now
    else j.story_time_anchor_at
      + ((p_real_now - j.real_time_anchor_at) * j.story_time_scale::double precision)
  end
  from public.journeys j
  where j.id = p_journey_id;
$$;

create table public.visitor_day_contributions (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  visitor_hash text not null check (length(visitor_hash) = 64),
  active_seconds numeric(18,3) not null default 0 check (active_seconds >= 0),
  first_contributed_at timestamptz not null,
  last_contributed_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (country_day_id, visitor_hash),
  check (expires_at >= last_contributed_at)
);

create index visitor_day_contributions_expiry_idx
  on public.visitor_day_contributions (expires_at);

create table public.postcards (
  id uuid primary key default gen_random_uuid(),
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  visitor_hash text not null check (length(visitor_hash) = 64),
  public_token text not null unique check (length(public_token) >= 43),
  status text not null check (status in ('pending', 'ready', 'failed', 'expired')),
  contribution_seconds integer not null check (contribution_seconds >= 0),
  image_path text,
  og_image_path text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz not null,
  error_code text,
  unique (country_day_id, visitor_hash),
  check (
    status <> 'ready'
    or (image_path is not null and og_image_path is not null and ready_at is not null)
  )
);

create index postcards_public_lookup_idx
  on public.postcards (public_token, status, expires_at);
create index postcards_expiry_idx on public.postcards (expires_at);

alter table public.votes
  add column result_option_id uuid references public.vote_options(id) on delete set null,
  add column result_published_at timestamptz,
  add column tie_break_rule text not null default 'lowest_display_order'
    check (tie_break_rule = 'lowest_display_order');

create or replace function public.record_presence_heartbeat_v3(
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
  out_accounted_at timestamptz,
  out_global_active_seconds numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_visitor_seconds numeric(18,3) := 0;
begin
  select * into v_result
  from public.record_presence_heartbeat_v2(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second
  );

  if p_state <> 'observe' and p_visitor_hash is not null then
    -- A visitor's contribution is the most advanced tab lease, never the sum of
    -- all tabs. This preserves one-person/one-clock semantics across tab retries.
    select coalesce(max(pl.active_seconds), 0)
      into v_visitor_seconds
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visitor_hash = p_visitor_hash;

    insert into public.visitor_day_contributions (
      country_day_id,
      visitor_hash,
      active_seconds,
      first_contributed_at,
      last_contributed_at,
      expires_at
    ) values (
      p_country_day_id,
      p_visitor_hash,
      v_visitor_seconds,
      p_now,
      p_now,
      p_now + interval '400 days'
    )
    on conflict (country_day_id, visitor_hash) do update set
      active_seconds = greatest(
        public.visitor_day_contributions.active_seconds,
        excluded.active_seconds
      ),
      last_contributed_at = excluded.last_contributed_at,
      expires_at = excluded.expires_at;
  else
    v_visitor_seconds := coalesce(v_result.out_visitor_active_seconds, 0);
  end if;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_visitor_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds;
end;
$$;

alter table public.visitor_day_contributions enable row level security;
alter table public.postcards enable row level security;

revoke all on public.visitor_day_contributions, public.postcards from anon, authenticated;
revoke all on function public.journey_story_now(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v3(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) from public, anon, authenticated;

grant execute on function public.journey_story_now(uuid, timestamptz) to service_role;
grant execute on function public.record_presence_heartbeat_v3(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) to service_role;
