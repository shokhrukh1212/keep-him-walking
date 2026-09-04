-- Collapse the Phase 3 bootstrap read fan-out into one stable database call.
-- Presence heartbeat mutations remain separate and canonical.

create or replace function public.read_bootstrap_bundle_v3(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_country_day public.country_days%rowtype;
  v_story_now timestamptz;
  v_result jsonb;
begin
  if length(p_visitor_hash) <> 64 then
    raise exception 'invalid visitor hash' using errcode = '22023';
  end if;

  select * into v_journey
  from public.journeys j
  where j.phase2_enabled
    and j.status in ('preview', 'active')
  order by j.starts_at desc
  limit 1;
  if not found then return null; end if;

  v_story_now := public.journey_story_now(v_journey.id, p_real_now);
  select * into v_country_day
  from public.country_days cd
  where cd.journey_id = v_journey.id
    and cd.status in ('scheduled', 'live')
    and cd.starts_at <= v_story_now
    and cd.ends_at > v_story_now
  order by cd.starts_at desc
  limit 1;
  if not found then return null; end if;

  select jsonb_build_object(
    'country_day', to_jsonb(v_country_day) || jsonb_build_object(
      'total_days', v_journey.total_days,
      'story_now', v_story_now,
      'story_scale', v_journey.story_time_scale
    ),
    'runtime', (
      select to_jsonb(runtime_row)
      from public.read_journey_runtime_v3(
        v_country_day.id, p_real_now, p_ttl_seconds, p_steps_per_second
      ) runtime_row
    ),
    'events', coalesce((
      select jsonb_agg(to_jsonb(event_row) order by event_row.starts_at)
      from (
        select se.id, se.type, se.starts_at, se.duration_seconds, se.status, se.payload_json
        from public.story_events se
        where se.country_day_id = v_country_day.id
          and se.status in ('scheduled', 'live', 'completed')
      ) event_row
    ), '[]'::jsonb),
    'vote', (
      select to_jsonb(vote_row) || jsonb_build_object(
        'vote_options', coalesce((
          select jsonb_agg(to_jsonb(option_row) order by option_row.display_order)
          from (
            select vo.id, vo.label, vo.display_order
            from public.vote_options vo
            where vo.vote_id = vote_row.id
          ) option_row
        ), '[]'::jsonb),
        'ballots', coalesce((
          select jsonb_agg(jsonb_build_object('option_id', b.option_id, 'voter_hash', b.voter_hash))
          from public.ballots b
          where b.vote_id = vote_row.id
        ), '[]'::jsonb)
      )
      from (
        select v.id, v.question, v.opens_at, v.closes_at, v.status
        from public.votes v
        where v.country_day_id = v_country_day.id
          and v.opens_at <= v_story_now
        order by v.opens_at desc
        limit 1
      ) vote_row
    ),
    'contribution_seconds', (
      select c.active_seconds
      from public.visitor_day_contributions c
      where c.country_day_id = v_country_day.id and c.visitor_hash = p_visitor_hash
    ),
    'postcard', (
      select jsonb_build_object('public_token', p.public_token, 'status', p.status, 'expires_at', p.expires_at)
      from public.postcards p
      where p.country_day_id = v_country_day.id
        and p.visitor_hash = p_visitor_hash
        and p.status = 'ready'
        and p.expires_at > p_real_now
      limit 1
    ),
    'sponsor', (
      select jsonb_build_object(
        'public_id', s.public_id,
        'status', s.status,
        'sponsor_name', s.sponsor_name,
        'disclosure', s.disclosure,
        'public_creative_path', s.public_creative_path,
        'cta_label', s.cta_label
      )
      from public.sponsor_slots slot
      join public.sponsorships s on s.slot_id = slot.id and s.status = 'live'
      where slot.country_day_id = v_country_day.id
      limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.read_bootstrap_bundle_v3(text, timestamptz, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.read_bootstrap_bundle_v3(text, timestamptz, integer, numeric)
  to service_role;
