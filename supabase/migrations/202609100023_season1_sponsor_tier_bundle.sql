-- P15: the bootstrap bundle carries the live sponsorship's tier, so the premium
-- placements (the bottle label, the cafe sign) can be drawn only for a purchase
-- that actually bought them. v9 remains the rollback contract.
--
-- The tier is read from the same live sponsorship the v3 sub-select already
-- publishes, so an unapproved or ended sponsorship still shows nothing at all.

create or replace function public.read_bootstrap_bundle_v10(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_pace_cap real
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_bundle jsonb;
  v_public_id uuid;
  v_tier text;
begin
  v_result := public.read_bootstrap_bundle_v9(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_rate_limit,
    p_rate_window_seconds,
    p_pace_cap
  );

  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;

  v_bundle := v_result -> 'bundle';
  v_public_id := nullif(v_bundle #>> '{sponsor,public_id}', '')::uuid;
  if v_public_id is null then
    return jsonb_build_object('allowed', true, 'bundle', v_bundle);
  end if;

  select s.tier into v_tier
  from public.sponsorships s
  where s.public_id = v_public_id and s.status = 'live';

  v_bundle := jsonb_set(
    v_bundle,
    '{sponsor,tier}',
    to_jsonb(coalesce(v_tier, 'standard')),
    true
  );

  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.read_bootstrap_bundle_v10(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;
grant execute on function public.read_bootstrap_bundle_v10(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
