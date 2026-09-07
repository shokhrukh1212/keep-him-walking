-- Read-only bootstrap projection. Bootstrap traffic must not serialize on the
-- journey_runtime row; canonical writes remain owned by presence heartbeats.

create or replace function public.read_journey_runtime_v3(
  p_country_day_id uuid,
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
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.journey_runtime%rowtype;
  v_active_until timestamptz;
  v_delta_seconds numeric(18,3) := 0;
  v_active_viewers bigint := 0;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;
  if p_steps_per_second <= 0 or p_steps_per_second > 10 then
    raise exception 'invalid step rate' using errcode = '22023';
  end if;

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;

  if not found then
    return query select 0::bigint, 0::bigint, 0::numeric, p_now, 0::numeric;
    return;
  end if;

  select
    max(pl.last_seen_at + make_interval(secs => p_ttl_seconds)),
    count(distinct pl.visitor_hash) filter (
      where pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now
    )
  into v_active_until, v_active_viewers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_runtime.last_accounted_at;

  if v_active_until is not null then
    v_delta_seconds := greatest(
      0,
      extract(epoch from least(greatest(p_now, v_runtime.last_accounted_at), v_active_until) - v_runtime.last_accounted_at)
    );
  end if;

  return query select
    coalesce(v_active_viewers, 0),
    floor((v_runtime.global_active_seconds + v_delta_seconds) * p_steps_per_second)::bigint,
    0::numeric,
    greatest(p_now, v_runtime.last_accounted_at),
    v_runtime.global_active_seconds + v_delta_seconds;
end;
$$;

revoke all on function public.read_journey_runtime_v3(uuid, timestamptz, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.read_journey_runtime_v3(uuid, timestamptz, integer, numeric)
  to service_role;
