create or replace function public.record_presence_heartbeat_v2(
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
  v_active_seconds numeric;
begin
  select * into v_result
  from public.record_presence_heartbeat(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second
  );

  select global_active_seconds into v_active_seconds
  from public.journey_runtime
  where country_day_id = p_country_day_id;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    coalesce(v_active_seconds, 0);
end;
$$;

revoke all on function public.record_presence_heartbeat_v2(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) from public, anon, authenticated;
grant execute on function public.record_presence_heartbeat_v2(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) to service_role;
