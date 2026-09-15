-- Moves a season that has not started to a new start, keeping its cities and plan.
--
-- configure_season (0040) refuses any change to an existing season, so a scheduled
-- start could only be moved with hand-written SQL. The owner moved Season 1 from
-- 17 to 18 September 2026 and needs to change the launch date without help. This
-- function shifts every stored instant of one draft season by the same interval,
-- under the journey row lock: the journey's start, launch and end, its seven days,
-- their runtime anchors, departure beats and ballots.
--
-- It refuses once the season has started, while money is involved (a checkout in
-- progress, or a paid, live, completed or refund-owed sponsorship), when the new
-- start is not a future 16:00 UTC boundary, and when the moved week would overlap
-- another season. Requests that are only submitted or approved keep the dates they
-- were quoted, so the 0042 checkout guard refuses them ("season schedule changed")
-- and no sponsor pays for a week they did not agree to.

create or replace function public.reschedule_season(
  p_season_number integer,
  p_starts_at timestamptz,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.journeys%rowtype;
  v_shift interval;
  v_day record;
  v_moved integer := 0;
  v_stale integer;
begin
  if p_season_number is null or p_season_number < 1
    or p_starts_at is null or p_now is null
    or extract(hour from p_starts_at at time zone 'UTC') <> 16
    or extract(minute from p_starts_at at time zone 'UTC') <> 0
    or extract(second from p_starts_at at time zone 'UTC') <> 0 then
    raise exception 'invalid season start' using errcode = '22023';
  end if;

  select * into v_season
  from public.journeys j
  where j.ends_at is not null and j.season_number = p_season_number
  for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_season.status <> 'draft' or v_season.starts_at <= p_now then
    raise exception 'a season can only be moved before it starts' using errcode = '55000';
  end if;
  if p_starts_at <= p_now then
    raise exception 'a season must be configured before it starts' using errcode = '22023';
  end if;
  if p_starts_at = v_season.starts_at then
    return jsonb_build_object(
      'state', 'unchanged', 'journeyId', v_season.id,
      'startsAt', v_season.starts_at, 'endsAt', v_season.ends_at
    );
  end if;
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = v_season.id
      and s.status in ('payment_pending', 'scheduled', 'active', 'completed', 'refund_required')
  ) then
    raise exception 'season has a sponsor payment' using errcode = '55000';
  end if;

  v_shift := p_starts_at - v_season.starts_at;
  if exists (
    select 1 from public.journeys j
    where j.id <> v_season.id
      and j.ends_at is not null
      and tstzrange(j.starts_at, j.ends_at, '[)')
        && tstzrange(p_starts_at, v_season.ends_at + v_shift, '[)')
  ) then
    raise exception 'season overlaps another season' using errcode = '23P01';
  end if;

  -- The journey moves first, so each day checked by country_days_season_bounds is
  -- compared with the new window. Days move from the far end of the shift inwards,
  -- so no two days of the season ever share an instant mid-statement.
  update public.journeys j
  set starts_at = j.starts_at + v_shift,
      launch_at = j.launch_at + v_shift,
      ends_at = j.ends_at + v_shift,
      updated_at = p_now
  where j.id = v_season.id;

  for v_day in
    select cd.id
    from public.country_days cd
    where cd.journey_id = v_season.id
    order by case when v_shift > interval '0' then -cd.day_number else cd.day_number end
    for update
  loop
    update public.country_days cd
    set starts_at = cd.starts_at + v_shift,
        ends_at = cd.ends_at + v_shift,
        updated_at = p_now
    where cd.id = v_day.id;
    update public.journey_runtime jr
    set last_accounted_at = jr.last_accounted_at + v_shift,
        updated_at = p_now
    where jr.country_day_id = v_day.id;
    update public.story_events e
    set starts_at = e.starts_at + v_shift,
        updated_at = p_now
    where e.country_day_id = v_day.id;
    update public.votes v
    set opens_at = v.opens_at + v_shift,
        closes_at = v.closes_at + v_shift,
        result_publishes_at = v.result_publishes_at + v_shift,
        updated_at = p_now
    where v.country_day_id = v_day.id;
    v_moved := v_moved + 1;
  end loop;

  select count(*) into v_stale
  from public.season_sponsorships s
  where s.journey_id = v_season.id
    and s.status in ('submitted', 'approved');

  return jsonb_build_object(
    'state', 'moved', 'journeyId', v_season.id,
    'previousStartsAt', v_season.starts_at,
    'startsAt', p_starts_at, 'endsAt', v_season.ends_at + v_shift,
    'days', v_moved, 'requestsQuotedOldDates', v_stale
  );
end;
$$;

revoke all on function public.reschedule_season(integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_season(integer, timestamptz, timestamptz) to service_role;
