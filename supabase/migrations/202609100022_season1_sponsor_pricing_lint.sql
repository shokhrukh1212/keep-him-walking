-- Corrects 202609100021: `open_sponsor_pricing_window` declared `v_offset` in its
-- DECLARE block while `for v_offset in 1..p_window_days` also creates an automatic
-- loop variable of the same name. `db lint` reports both the shadowing and the now
-- unused declaration, and a shadowed name is a real defect: a later edit that read
-- v_offset outside the loop would silently see the declared NULL instead.
-- The body is otherwise unchanged.

create or replace function public.open_sponsor_pricing_window(
  p_journey_id uuid,
  p_real_now timestamptz,
  p_floor_cents integer,
  p_cents_per_unique integer,
  p_founding_cents integer,
  p_cap_cents integer,
  p_window_days integer,
  p_currency char(3) default 'USD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_today date;
  v_founding_until date;
  v_basis integer;
  v_price integer;
  v_date date;
  v_founding boolean;
  v_opened jsonb := '[]'::jsonb;
begin
  if p_window_days < 1 or p_window_days > 30 then
    raise exception 'invalid sponsor window' using errcode = '22023';
  end if;
  select * into v_journey from public.journeys where id = p_journey_id for update;
  if not found then return jsonb_build_object('state', 'unknown_journey', 'opened', 0); end if;

  v_today := public.journey_slot_date(p_journey_id, p_real_now);
  if v_today is null then return jsonb_build_object('state', 'no_days', 'opened', 0); end if;

  -- Days 1..window of the season are the pre-sold founding block.
  v_founding_until := (v_journey.starts_at at time zone 'UTC')::date + (p_window_days - 1);

  -- "Yesterday" is the most recent finalized day. Absent one, the floor applies.
  select o.unique_watchers into v_basis
  from public.day_outcomes o
  join public.country_days cd on cd.id = o.country_day_id
  where cd.journey_id = p_journey_id
  order by cd.starts_at desc
  limit 1;
  v_basis := coalesce(v_basis, 0);

  for offset_days in 1..p_window_days loop
    v_date := v_today + offset_days;
    v_founding := v_date <= v_founding_until;
    v_price := case
      when v_founding then p_founding_cents
      else public.sponsor_price_cents(v_basis, p_floor_cents, p_cents_per_unique, p_cap_cents)
    end;

    insert into public.sponsor_pricing (journey_id, day_date, price_cents, basis_uniques, founding, opened_at)
    values (p_journey_id, v_date, v_price, case when v_founding then 0 else v_basis end, v_founding, p_real_now)
    on conflict (journey_id, day_date) do nothing;

    if found then
      v_opened := v_opened || jsonb_build_object('date', v_date, 'priceCents', v_price, 'founding', v_founding);
    end if;

    -- The slot carries the price the date opened at, even if the formula moves later.
    insert into public.sponsor_slots (journey_id, slot_date, price_cents, currency, status, created_at, updated_at)
    select p_journey_id, v_date, sp.price_cents, upper(p_currency), 'available', p_real_now, p_real_now
    from public.sponsor_pricing sp
    where sp.journey_id = p_journey_id and sp.day_date = v_date
    on conflict (journey_id, slot_date) do nothing;
  end loop;

  return jsonb_build_object('state', 'ok', 'today', v_today, 'basisUniques', v_basis, 'opened', v_opened);
end;
$$;

revoke all on function public.open_sponsor_pricing_window(uuid, timestamptz, integer, integer, integer, integer, integer, char) from public, anon, authenticated;
grant execute on function public.open_sponsor_pricing_window(uuid, timestamptz, integer, integer, integer, integer, integer, char) to service_role;
