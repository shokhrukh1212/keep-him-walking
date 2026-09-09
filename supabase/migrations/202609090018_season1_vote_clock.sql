-- Season 1 follow-up to 0016: create_next_country_day accepted p_real_now but
-- never used it, so the rows it wrote were stamped from the database clock
-- rather than the caller's. Every other write in this schema is stamped from the
-- explicit clock it is given, which is what keeps a rehearsal story-clock
-- consistent. This redefinition uses it and clears the `db lint` warning.

create or replace function public.create_next_country_day(
  p_real_now timestamptz,
  p_day jsonb,
  p_vote jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_day_id uuid;
  v_vote_id uuid;
  v_existing uuid;
  v_option jsonb;
  v_order integer := 0;
begin
  select * into v_journey
  from public.journeys j
  where j.phase2_enabled
    and j.status in ('preview', 'active')
  order by j.starts_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('state', 'inactive');
  end if;

  select cd.id into v_existing
  from public.country_days cd
  where cd.journey_id = v_journey.id
    and cd.day_number = (p_day ->> 'dayNumber')::integer;

  if v_existing is not null then
    return jsonb_build_object('state', 'exists', 'countryDayId', v_existing);
  end if;

  insert into public.country_days (
    journey_id, day_number, country_code, country_name, city_name, time_zone,
    starts_at, ends_at, scene_pack_id, status, story_summary,
    created_at, updated_at
  ) values (
    v_journey.id,
    (p_day ->> 'dayNumber')::integer,
    p_day ->> 'countryCode',
    p_day ->> 'countryName',
    p_day ->> 'cityName',
    p_day ->> 'timeZone',
    (p_day ->> 'startsAt')::timestamptz,
    (p_day ->> 'endsAt')::timestamptz,
    p_day ->> 'scenePackId',
    'scheduled',
    p_day ->> 'storySummary',
    p_real_now,
    p_real_now
  )
  returning id into v_day_id;

  if p_vote is null or p_vote = 'null'::jsonb then
    return jsonb_build_object('state', 'created', 'countryDayId', v_day_id, 'voteId', null);
  end if;

  insert into public.votes (
    country_day_id, question, opens_at, closes_at, result_publishes_at, status, kind,
    created_at, updated_at
  ) values (
    v_day_id,
    p_vote ->> 'question',
    (p_vote ->> 'opensAt')::timestamptz,
    (p_vote ->> 'closesAt')::timestamptz,
    (p_vote ->> 'closesAt')::timestamptz,
    'open',
    coalesce(p_vote ->> 'kind', 'destination'),
    p_real_now,
    p_real_now
  )
  returning id into v_vote_id;

  for v_option in select * from jsonb_array_elements(p_vote -> 'options') loop
    insert into public.vote_options (vote_id, label, payload_json, display_order, pack_id)
    values (
      v_vote_id,
      v_option ->> 'label',
      coalesce(v_option -> 'payload', '{}'::jsonb),
      v_order,
      v_option ->> 'packId'
    );
    v_order := v_order + 1;
  end loop;

  return jsonb_build_object('state', 'created', 'countryDayId', v_day_id, 'voteId', v_vote_id);
end;
$$;

revoke all on function public.create_next_country_day(timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_next_country_day(timestamptz, jsonb, jsonb) to service_role;
