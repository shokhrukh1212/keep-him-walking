-- Corrects 0045's replan guard for an owner-authorized prelaunch route replacement.
-- The normal replan RPC remains strict. This separate RPC is service-role only and
-- requires an explicit confirmation field before it discards disposable prelaunch
-- activity attached to country days and writes the replacement schedule.

create or replace function public.replan_prelaunch_season(
  p_plan jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.journeys%rowtype;
begin
  if coalesce((p_plan ->> 'confirmDiscardPrelaunchActivity')::boolean, false) is not true then
    raise exception 'explicit prelaunch activity confirmation required' using errcode = '22023';
  end if;
  if p_now is null or nullif(p_plan #>> '{season,seasonNumber}', '') is null then
    raise exception 'invalid season plan' using errcode = '22023';
  end if;

  select * into v_season
  from public.journeys j
  where j.ends_at is not null
    and j.season_number = (p_plan #>> '{season,seasonNumber}')::integer
  for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_season.status <> 'draft' or v_season.starts_at <= p_now then
    raise exception 'a season can only be replanned before it starts' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = v_season.id
      and s.status in ('payment_pending', 'scheduled', 'active', 'completed', 'refund_required')
  ) then
    raise exception 'season has a sponsor payment' using errcode = '55000';
  end if;

  -- Prelaunch history belongs to the abandoned itinerary. Deleting the parent
  -- country days uses the established foreign-key cascade rather than preserving
  -- a visitor record against a different city.
  delete from public.country_days cd where cd.journey_id = v_season.id;

  return public.replan_season(p_plan - 'confirmDiscardPrelaunchActivity', p_now);
end;
$$;

revoke all on function public.replan_prelaunch_season(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.replan_prelaunch_season(jsonb, timestamptz) to service_role;
