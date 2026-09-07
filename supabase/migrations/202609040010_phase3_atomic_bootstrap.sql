-- Keep bootstrap admission and projection in one database round trip.
-- Expired rate-limit rows are cleaned by operational maintenance instead of
-- making every public request compete on the same DELETE statement.

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

  return v_count <= p_limit;
end;
$$;

create or replace function public.read_bootstrap_bundle_v4(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
  v_bundle jsonb;
begin
  v_allowed := public.consume_mutation_rate_limit(
    p_visitor_hash,
    'bootstrap',
    p_rate_limit,
    p_rate_window_seconds,
    p_real_now
  );

  if not v_allowed then
    return jsonb_build_object('allowed', false, 'bundle', null);
  end if;

  v_bundle := public.read_bootstrap_bundle_v3(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second
  );
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.read_bootstrap_bundle_v4(text, timestamptz, integer, numeric, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_bootstrap_bundle_v4(text, timestamptz, integer, numeric, integer, integer)
  to service_role;
