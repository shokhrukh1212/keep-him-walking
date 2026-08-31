create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  starts_at timestamptz not null,
  total_days integer not null check (total_days > 0),
  status text not null check (status in ('draft', 'preview', 'active', 'completed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.country_days (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  country_code char(2) not null,
  country_name text not null,
  city_name text not null,
  time_zone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scene_pack_id text not null,
  status text not null check (status in ('draft', 'scheduled', 'live', 'completed')),
  story_summary text,
  postcard_background_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (journey_id, day_number),
  unique (journey_id, starts_at),
  exclude using gist (
    journey_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index country_days_current_idx
  on public.country_days (status, starts_at, ends_at);

create table public.story_events (
  id uuid primary key default gen_random_uuid(),
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  type text not null check (
    type in ('ambient_window', 'action', 'encounter', 'vote_open', 'vote_result', 'sponsor_moment', 'departure', 'arrival')
  ),
  starts_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  payload_json jsonb not null default '{}'::jsonb,
  status text not null check (status in ('draft', 'scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index story_events_schedule_idx
  on public.story_events (country_day_id, starts_at);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  question text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  result_publishes_at timestamptz not null,
  status text not null check (status in ('draft', 'open', 'closed', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at),
  check (result_publishes_at >= closes_at)
);

create index votes_current_idx
  on public.votes (country_day_id, status, opens_at, closes_at);

create table public.vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  label text not null,
  payload_json jsonb not null default '{}'::jsonb,
  display_order integer not null check (display_order >= 0),
  unique (vote_id, display_order)
);

create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  voter_hash text not null check (length(voter_hash) = 64),
  option_id uuid not null references public.vote_options(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (vote_id, voter_hash)
);

create index ballots_vote_option_idx on public.ballots (vote_id, option_id);

create table public.step_buckets (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  bucket_start timestamptz not null,
  active_viewers integer not null default 0 check (active_viewers >= 0),
  contributed_viewer_seconds numeric(18,3) not null default 0 check (contributed_viewer_seconds >= 0),
  calculated_steps bigint not null default 0 check (calculated_steps >= 0),
  updated_at timestamptz not null default now(),
  primary key (country_day_id, bucket_start),
  check (bucket_start = date_trunc('minute', bucket_start))
);

create table public.journey_runtime (
  country_day_id uuid primary key references public.country_days(id) on delete cascade,
  last_accounted_at timestamptz not null,
  active_viewers integer not null default 0 check (active_viewers >= 0),
  global_active_seconds numeric(18,3) not null default 0 check (global_active_seconds >= 0),
  global_steps bigint not null default 0 check (global_steps >= 0),
  updated_at timestamptz not null default now()
);

create table public.presence_leases (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  session_hash text not null check (length(session_hash) = 64),
  visitor_hash text not null check (length(visitor_hash) = 64),
  last_seen_at timestamptz not null,
  visible boolean not null default false,
  scene_ready boolean not null default false,
  active_seconds numeric(18,3) not null default 0 check (active_seconds >= 0),
  created_at timestamptz not null default now(),
  primary key (country_day_id, session_hash)
);

create index presence_leases_active_idx
  on public.presence_leases (country_day_id, last_seen_at desc)
  where visible and scene_ready;

create index presence_leases_visitor_idx
  on public.presence_leases (country_day_id, visitor_hash);

create table public.mutation_rate_limits (
  key_hash text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (key_hash, action, window_start)
);

create index mutation_rate_limits_expiry_idx
  on public.mutation_rate_limits (expires_at);
