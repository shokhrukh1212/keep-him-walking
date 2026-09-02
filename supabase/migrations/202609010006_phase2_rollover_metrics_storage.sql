-- Phase 2 operational ledger, idempotent reconciliation, and storage boundaries.

create table public.operation_ledger (
  operation_key text primary key,
  operation_type text not null check (operation_type in (
    'rollover', 'vote_result', 'metric_aggregate', 'retention_cleanup', 'sponsor_reconcile'
  )),
  status text not null check (status in ('claimed', 'completed', 'failed')),
  payload_json jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  attempts integer not null default 1 check (attempts > 0)
);

create or replace function public.claim_operation(
  p_operation_key text,
  p_operation_type text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_claimed boolean := false;
begin
  insert into public.operation_ledger (
    operation_key, operation_type, status, claimed_at
  ) values (p_operation_key, p_operation_type, 'claimed', p_now)
  on conflict (operation_key) do update set
    status = 'claimed',
    claimed_at = excluded.claimed_at,
    attempts = public.operation_ledger.attempts + 1,
    error_code = null
  where public.operation_ledger.status = 'failed'
     or (
       public.operation_ledger.status = 'claimed'
       and public.operation_ledger.claimed_at < p_now - interval '15 minutes'
     )
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.reconcile_phase2_state(
  p_real_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_story_now timestamptz;
  v_live_day_id uuid;
  v_changed bigint := 0;
begin
  select * into v_journey
  from public.journeys
  where phase2_enabled and status in ('preview', 'active')
  order by starts_at desc
  limit 1
  for update;
  if not found then return jsonb_build_object('state', 'inactive', 'changed', 0); end if;

  v_story_now := public.journey_story_now(v_journey.id, p_real_now);
  select id into v_live_day_id
  from public.country_days
  where journey_id = v_journey.id and starts_at <= v_story_now and ends_at > v_story_now
  order by starts_at
  limit 1;

  update public.country_days set
    status = case
      when id = v_live_day_id then 'live'
      when ends_at <= v_story_now then 'completed'
      else 'scheduled'
    end,
    updated_at = p_real_now
  where journey_id = v_journey.id
    and status is distinct from case
      when id = v_live_day_id then 'live'
      when ends_at <= v_story_now then 'completed'
      else 'scheduled'
    end;
  get diagnostics v_changed = row_count;

  update public.sponsor_slots ss set
    status = 'available', reserved_by = null, reserved_until = null, updated_at = p_real_now
  where ss.status = 'reserved' and ss.reserved_until <= p_real_now;

  update public.sponsorships s set status = 'cancelled', updated_at = p_real_now
  where s.status = 'checkout_pending'
    and exists (
      select 1 from public.sponsor_slots ss
      where ss.id = s.slot_id and ss.status = 'available' and ss.reserved_by is null
    );

  update public.sponsorships s set status = 'scheduled', updated_at = p_real_now
  from public.sponsor_slots ss, public.country_days cd
  where s.slot_id = ss.id and ss.country_day_id = cd.id
    and s.status = 'approved'
    and s.approved_at is not null;

  update public.sponsorships s set status = 'live', updated_at = p_real_now
  from public.sponsor_slots ss, public.country_days cd
  where s.slot_id = ss.id and ss.country_day_id = cd.id
    and s.status = 'scheduled'
    and cd.starts_at <= v_story_now;

  update public.sponsorships s set status = 'completed', updated_at = p_real_now
  from public.sponsor_slots ss, public.country_days cd
  where s.slot_id = ss.id and ss.country_day_id = cd.id
    and s.status = 'live'
    and cd.ends_at <= v_story_now;

  return jsonb_build_object(
    'state', case when v_live_day_id is null then 'completed' else 'live' end,
    'storyNow', v_story_now,
    'countryDayId', v_live_day_id,
    'changed', v_changed
  );
end;
$$;

create or replace function public.cleanup_phase2_retention(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_postcards bigint; v_contributions bigint; v_limits bigint;
begin
  update public.postcards set status = 'expired'
  where expires_at <= p_now and status <> 'expired';
  get diagnostics v_postcards = row_count;
  delete from public.visitor_day_contributions where expires_at <= p_now;
  get diagnostics v_contributions = row_count;
  delete from public.mutation_rate_limits where expires_at <= p_now;
  get diagnostics v_limits = row_count;
  return jsonb_build_object(
    'expiredPostcards', v_postcards,
    'deletedContributions', v_contributions,
    'deletedRateLimits', v_limits
  );
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('khw-postcards', 'khw-postcards', true, 5242880, array['image/webp']),
  ('khw-sponsor-private', 'khw-sponsor-private', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('khw-sponsor-public', 'khw-sponsor-public', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public postcard and approved sponsor creative reads"
on storage.objects for select to anon, authenticated
using (bucket_id in ('khw-postcards', 'khw-sponsor-public'));

alter table public.operation_ledger enable row level security;
revoke all on public.operation_ledger from anon, authenticated;
revoke all on function public.claim_operation(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_phase2_state(timestamptz) from public, anon, authenticated;
revoke all on function public.cleanup_phase2_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_operation(text, text, timestamptz) to service_role;
grant execute on function public.reconcile_phase2_state(timestamptz) to service_role;
grant execute on function public.cleanup_phase2_retention(timestamptz) to service_role;
