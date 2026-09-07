create table public.country_notification_opt_ins (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (visitor_hash, country_code),
  check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

create index country_notification_opt_ins_active_idx
  on public.country_notification_opt_ins (country_code, created_at)
  where status = 'active';

create table public.experiment_exposures (
  experiment_id text not null,
  variant_id text not null,
  visitor_day_hash text not null,
  country_day_id uuid references public.country_days(id) on delete cascade,
  exposed_at timestamptz not null default now(),
  primary key (experiment_id, visitor_day_hash)
);

create index experiment_exposures_country_day_idx
  on public.experiment_exposures (country_day_id, experiment_id, variant_id);

create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null unique,
  severity text not null check (severity in ('warning', 'error', 'critical')),
  subsystem text not null,
  summary text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index operational_incidents_open_idx
  on public.operational_incidents (severity, occurred_at desc)
  where resolved_at is null;

create table public.webhook_replay_audit (
  id uuid primary key default gen_random_uuid(),
  payment_webhook_event_id uuid references public.payment_webhook_events(id) on delete set null,
  provider_event_id text not null,
  requested_by text not null,
  disposition text not null check (disposition in ('inspected', 'replayed', 'rejected', 'failed')),
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index webhook_replay_audit_event_idx
  on public.webhook_replay_audit (provider_event_id, created_at desc);

alter table public.country_notification_opt_ins enable row level security;
alter table public.experiment_exposures enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.webhook_replay_audit enable row level security;

revoke all on public.country_notification_opt_ins, public.experiment_exposures,
  public.operational_incidents, public.webhook_replay_audit from anon, authenticated;

create or replace function public.set_country_notification_opt_in(
  p_visitor_hash text,
  p_country_code text,
  p_enabled boolean,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text := case when p_enabled then 'active' else 'revoked' end;
begin
  if length(p_visitor_hash) < 32 or p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid notification preference' using errcode = '22023';
  end if;
  insert into public.country_notification_opt_ins (
    visitor_hash, country_code, status, created_at, revoked_at
  ) values (
    p_visitor_hash, p_country_code, v_status, p_now,
    case when p_enabled then null else p_now end
  )
  on conflict (visitor_hash, country_code) do update set
    status = excluded.status,
    revoked_at = excluded.revoked_at;
  return v_status;
end;
$$;

revoke all on function public.set_country_notification_opt_in(text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_country_notification_opt_in(text, text, boolean, timestamptz)
  to service_role;
