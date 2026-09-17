-- Correct migration 0047: a placement paid before its journey starts is delivered
-- from the authoritative scheduled start, not from the reconciler's later minute.

create or replace function public.reconcile_season_sponsorships(p_real_now timestamptz, p_cutoff_hours integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_activated integer; v_completed integer; v_expired integer;
begin
  if p_cutoff_hours not between 24 and 720 then raise exception 'invalid sale cutoff' using errcode = '22023'; end if;
  update public.season_sponsorships s set status='active', delivered_from=coalesce(s.delivered_from,j.starts_at), updated_at=p_real_now
    from public.journeys j where j.id=s.journey_id and s.status='scheduled' and j.starts_at<=p_real_now and j.ends_at>p_real_now;
  get diagnostics v_activated = row_count;
  update public.season_sponsorships s set status='completed', delivered_until=coalesce(s.delivered_until,j.ends_at), updated_at=p_real_now
    from public.journeys j where j.id=s.journey_id and s.status in ('scheduled','active') and j.ends_at<=p_real_now;
  get diagnostics v_completed = row_count;
  update public.season_sponsorships s set status='expired', status_reason='season_ended', updated_at=p_real_now
    from public.journeys j where j.id=s.journey_id and s.status in ('submitted','approved') and j.ends_at<=p_real_now;
  get diagnostics v_expired = row_count;
  return jsonb_build_object('activated',v_activated,'completed',v_completed,'expired',v_expired);
end;
$$;
