-- Replace the retired fixed-price season offer with the approved featured-sponsor
-- model: USD 50.00 initially, then twice the current sponsor's paid price.  The
-- browser still supplies neither price nor authority; every decision is made under
-- the journey row lock and a displaced sponsor is put on the refund ledger first.

alter table public.season_sponsorships
  drop constraint if exists season_sponsorships_quoted_dates_check,
  add constraint season_sponsorships_quoted_dates_check
    check (quoted_ends_at > quoted_starts_at);

drop index if exists public.season_sponsorships_one_holder_idx;
create unique index season_sponsorships_current_holder_idx
  on public.season_sponsorships (journey_id)
  where status in ('scheduled', 'active');
create unique index season_sponsorships_checkout_holder_idx
  on public.season_sponsorships (journey_id)
  where status = 'payment_pending';

-- Retain the historical table for old records, but make new public defaults honest.
update public.season_sponsor_prices set price_cents = 5000 where season_number in (1, 2, 3);

create or replace function public.season_replacement_price(p_journey_id uuid)
returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_current_price integer;
begin
  select s.price_cents into v_current_price
  from public.season_sponsorships s
  where s.journey_id = p_journey_id and s.status in ('scheduled', 'active')
  order by s.paid_at desc nulls last, s.created_at desc
  limit 1;
  if v_current_price is null then return 5000; end if;
  if v_current_price > 1000000000 then
    raise exception 'featured sponsor price exceeds supported payment amount' using errcode = '22023';
  end if;
  return v_current_price * 2;
end;
$$;
revoke all on function public.season_replacement_price(uuid) from public, anon, authenticated;

create or replace function public.set_season_sponsorship_quote()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select j.starts_at, j.ends_at into v_starts_at, v_ends_at
  from public.journeys j where j.id = new.journey_id;
  if v_ends_at is null then raise exception 'season is not configured' using errcode = '55000'; end if;
  new.price_cents := public.season_replacement_price(new.journey_id);
  new.currency := 'USD';
  new.quoted_starts_at := v_starts_at;
  new.quoted_ends_at := v_ends_at;
  return new;
end;
$$;

create or replace function public.submit_season_sponsorship(
  p_journey_id uuid, p_product_name text, p_website_url text, p_description text,
  p_contact_name text, p_contact_email text, p_private_logo_path text,
  p_rights_confirmed boolean, p_now timestamptz, p_cutoff_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_season public.journeys%rowtype; v_id uuid; v_public_id uuid;
begin
  if p_cutoff_hours < 24 or p_cutoff_hours > 720 then raise exception 'invalid sale cutoff' using errcode = '22023'; end if;
  if p_rights_confirmed is distinct from true then raise exception 'rights to the supplied material must be confirmed' using errcode = '22023'; end if;
  select * into v_season from public.journeys j where j.id = p_journey_id for share;
  if not found or v_season.ends_at is null or not v_season.phase2_enabled
    or v_season.status not in ('draft', 'preview', 'active') or v_season.ends_at <= p_now then
    raise exception 'season is not open for sponsorship' using errcode = '55000';
  end if;
  insert into public.season_sponsorships (
    journey_id, status, product_name, website_url, description, contact_name,
    contact_email, private_logo_path, rights_confirmed_at, submitted_at, created_at, updated_at
  ) values (
    p_journey_id, 'submitted', btrim(p_product_name), btrim(p_website_url), btrim(p_description),
    btrim(p_contact_name), lower(btrim(p_contact_email)), p_private_logo_path, p_now, p_now, p_now, p_now
  ) returning id, public_id into v_id, v_public_id;
  return jsonb_build_object('state', 'submitted', 'id', v_id, 'publicId', v_public_id, 'journeyId', p_journey_id);
end;
$$;

create or replace function public.review_season_sponsorship(
  p_id uuid, p_decision text, p_public_logo_path text, p_now timestamptz, p_cutoff_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_booking public.season_sponsorships%rowtype; v_ends_at timestamptz;
begin
  if p_decision not in ('approved', 'rejected') or p_cutoff_hours < 24 or p_cutoff_hours > 720 then raise exception 'invalid review decision' using errcode = '22023'; end if;
  select * into v_booking from public.season_sponsorships s where s.id = p_id for update;
  if not found then raise exception 'unknown season sponsorship' using errcode = 'P0002'; end if;
  if p_decision = 'rejected' then
    if v_booking.status not in ('submitted', 'approved') then raise exception 'only unpaid material can be rejected' using errcode = '55000'; end if;
    update public.season_sponsorships set status = 'rejected', status_reason = 'material_rejected', decided_at = p_now, updated_at = p_now where id = p_id;
    return jsonb_build_object('state', 'rejected', 'id', p_id);
  end if;
  if v_booking.status <> 'submitted' then raise exception 'only submitted material can be approved' using errcode = '55000'; end if;
  if nullif(btrim(p_public_logo_path), '') is null then raise exception 'approved material needs its public logo copy' using errcode = '22023'; end if;
  select j.ends_at into v_ends_at from public.journeys j where j.id = v_booking.journey_id;
  if v_ends_at <= p_now then raise exception 'season is not open for sponsorship' using errcode = '55000'; end if;
  update public.season_sponsorships set status = 'approved', approved_at = p_now, decided_at = p_now,
    public_logo_path = btrim(p_public_logo_path), status_reason = null, updated_at = p_now where id = p_id;
  return jsonb_build_object('state', 'approved', 'id', p_id);
end;
$$;

create or replace function public.enforce_season_sponsorship_checkout_quote()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_starts_at timestamptz; v_ends_at timestamptz; v_price_cents integer;
begin
  if new.status <> 'payment_pending' or old.status = 'payment_pending' then return new; end if;
  select j.starts_at, j.ends_at into v_starts_at, v_ends_at from public.journeys j where j.id = new.journey_id;
  v_price_cents := public.season_replacement_price(new.journey_id);
  if v_starts_at is distinct from new.quoted_starts_at or v_ends_at is distinct from new.quoted_ends_at then raise exception 'season schedule changed' using errcode = '55000'; end if;
  if v_price_cents is distinct from new.price_cents then raise exception 'season quote changed' using errcode = '55000'; end if;
  return new;
end;
$$;

create or replace function public.hold_season_sponsorship(
  p_public_id uuid, p_provider text, p_test_mode boolean, p_hold_minutes integer,
  p_grace_minutes integer, p_cutoff_hours integer, p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.season_sponsorships%rowtype; v_ends_at timestamptz;
  v_holder public.season_sponsorships%rowtype; v_until timestamptz; v_price integer;
begin
  if p_provider not in ('dodo', 'fixture') or p_hold_minutes not between 10 and 120
    or p_grace_minutes not between 5 and 1440 or p_cutoff_hours not between 24 and 720 then
    raise exception 'invalid season hold' using errcode = '22023';
  end if;
  select * into v_booking from public.season_sponsorships s where s.public_id = p_public_id;
  if not found then raise exception 'unknown season sponsorship' using errcode = 'P0002'; end if;
  select j.ends_at into v_ends_at from public.journeys j where j.id = v_booking.journey_id for update;
  select * into v_booking from public.season_sponsorships s where s.id = v_booking.id for update;
  if v_booking.status in ('scheduled', 'active', 'completed') then return jsonb_build_object('state', 'paid', 'id', v_booking.id); end if;
  if v_booking.status not in ('approved', 'payment_pending') then return jsonb_build_object('state', 'not_approved', 'id', v_booking.id, 'status', v_booking.status); end if;
  if v_ends_at <= p_now then return jsonb_build_object('state', 'closed', 'id', v_booking.id); end if;
  v_price := public.season_replacement_price(v_booking.journey_id);
  if v_booking.price_cents <> v_price then raise exception 'season quote changed' using errcode = '55000'; end if;
  select * into v_holder from public.season_sponsorships s
    where s.journey_id = v_booking.journey_id and s.id <> v_booking.id and s.status = 'payment_pending' for update;
  if found then
    if v_holder.hold_expires_at + make_interval(mins => p_grace_minutes) > p_now then return jsonb_build_object('state', 'unavailable', 'id', v_booking.id); end if;
    update public.season_sponsorships set status = 'approved', hold_expires_at = null, status_reason = 'hold_expired', updated_at = p_now where id = v_holder.id;
  end if;
  v_until := p_now + make_interval(mins => p_hold_minutes);
  update public.season_sponsorships set status = 'payment_pending', provider = p_provider, test_mode = p_test_mode,
    hold_expires_at = v_until, status_reason = null, updated_at = p_now where id = v_booking.id;
  return jsonb_build_object('state', 'held', 'id', v_booking.id, 'holdExpiresAt', v_until);
end;
$$;

create or replace function public.confirm_season_payment(
  p_provider text, p_payment_id text, p_booking_id uuid, p_checkout_id text,
  p_amount_cents integer, p_tax_cents integer, p_currency text, p_test_mode boolean,
  p_product_matches boolean, p_tax_inclusive boolean, p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.season_sponsor_payments%rowtype; v_booking public.season_sponsorships%rowtype;
  v_season public.journeys%rowtype; v_displaced public.season_sponsorships%rowtype;
  v_reason text; v_net integer; v_expected integer;
begin
  if p_provider not in ('dodo', 'fixture') or nullif(btrim(p_payment_id), '') is null then raise exception 'invalid season payment' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('season-payment:' || p_provider || ':' || p_payment_id));
  select * into v_existing from public.season_sponsor_payments p where p.provider = p_provider and p.payment_id = p_payment_id for update;
  if found then return jsonb_build_object('outcome', v_existing.outcome, 'duplicate', true, 'bookingId', v_existing.season_sponsorship_id, 'reason', v_existing.reason); end if;
  select * into v_booking from public.season_sponsorships s where s.id = p_booking_id;
  if not found then
    insert into public.season_sponsor_payments (provider,payment_id,checkout_id,amount_cents,tax_cents,currency,test_mode,outcome,reason,received_at,updated_at)
    values (p_provider,p_payment_id,nullif(p_checkout_id,''),p_amount_cents,p_tax_cents,upper(p_currency),p_test_mode,'refund_required','unknown_booking',p_now,p_now);
    return jsonb_build_object('outcome','refund_required','duplicate',false,'bookingId',null,'reason','unknown_booking');
  end if;
  select * into v_season from public.journeys j where j.id = v_booking.journey_id for update;
  select * into v_booking from public.season_sponsorships s where s.id = p_booking_id for update;
  select * into v_displaced from public.season_sponsorships s
    where s.journey_id = v_booking.journey_id and s.id <> v_booking.id and s.status in ('scheduled','active') for update;
  v_expected := case when found then public.season_replacement_price(v_booking.journey_id) else 5000 end;
  v_net := case when p_tax_inclusive then p_amount_cents else p_amount_cents - coalesce(p_tax_cents, 0) end;
  v_reason := case
    when p_product_matches is distinct from true then 'product_mismatch'
    when upper(coalesce(p_currency,'')) <> v_booking.currency or v_net is distinct from v_booking.price_cents then 'amount_mismatch'
    when p_test_mode is distinct from v_booking.test_mode then 'mode_mismatch'
    when v_booking.status in ('scheduled','active','completed') then 'duplicate_payment'
    when v_booking.status not in ('approved','payment_pending','expired') or v_booking.approved_at is null then 'booking_not_payable'
    when v_season.starts_at is distinct from v_booking.quoted_starts_at or v_season.ends_at is distinct from v_booking.quoted_ends_at then 'schedule_changed'
    when v_booking.price_cents is distinct from v_expected then 'quote_changed'
    when v_season.ends_at <= p_now or v_season.status not in ('draft','preview','active') then 'season_ended'
    else null end;
  if v_reason is null then
    update public.season_sponsorships set status='approved', hold_expires_at=null, status_reason='checkout_superseded', updated_at=p_now
      where journey_id=v_booking.journey_id and id<>v_booking.id and status='payment_pending';
    if v_displaced.id is not null then
      update public.season_sponsor_payments set outcome='refund_required', reason='replaced', updated_at=p_now
        where provider=v_displaced.provider and payment_id=v_displaced.provider_payment_id and outcome in ('scheduled','refund_requested');
      update public.season_sponsorships set status='refund_required', hold_expires_at=null, status_reason='replaced',
        delivered_until=case when status='active' then p_now else delivered_until end, updated_at=p_now where id=v_displaced.id;
    end if;
    update public.season_sponsorships set status='scheduled', provider=p_provider, provider_payment_id=p_payment_id,
      provider_checkout_id=coalesce(nullif(p_checkout_id,''),provider_checkout_id), paid_at=p_now, hold_expires_at=null, status_reason=null, updated_at=p_now where id=v_booking.id;
    if v_season.starts_at <= p_now then
      update public.season_sponsorships set status='active', delivered_from=p_now, updated_at=p_now where id=v_booking.id;
    end if;
    insert into public.season_sponsor_payments (provider,payment_id,season_sponsorship_id,checkout_id,amount_cents,tax_cents,currency,test_mode,outcome,reason,received_at,updated_at)
    values (p_provider,p_payment_id,v_booking.id,nullif(p_checkout_id,''),p_amount_cents,p_tax_cents,upper(p_currency),p_test_mode,'scheduled',null,p_now,p_now);
    return jsonb_build_object('outcome','scheduled','duplicate',false,'bookingId',v_booking.id,'reason',null,
      'refundPaymentId',v_displaced.provider_payment_id,'refundProvider',v_displaced.provider);
  end if;
  if v_reason in ('booking_not_payable','schedule_changed','quote_changed','season_ended') and v_booking.provider_payment_id is null
    and v_booking.status in ('approved','payment_pending','expired','rejected','cancelled') then
    update public.season_sponsorships set status='refund_required', provider=p_provider, provider_payment_id=p_payment_id,
      paid_at=p_now, hold_expires_at=null, status_reason=v_reason, updated_at=p_now where id=v_booking.id;
  end if;
  insert into public.season_sponsor_payments (provider,payment_id,season_sponsorship_id,checkout_id,amount_cents,tax_cents,currency,test_mode,outcome,reason,received_at,updated_at)
  values (p_provider,p_payment_id,v_booking.id,nullif(p_checkout_id,''),p_amount_cents,p_tax_cents,upper(p_currency),p_test_mode,'refund_required',v_reason,p_now,p_now);
  return jsonb_build_object('outcome','refund_required','duplicate',false,'bookingId',v_booking.id,'reason',v_reason);
end;
$$;

create or replace function public.reconcile_season_sponsorships(p_real_now timestamptz, p_cutoff_hours integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_activated integer; v_completed integer; v_expired integer;
begin
  if p_cutoff_hours not between 24 and 720 then raise exception 'invalid sale cutoff' using errcode = '22023'; end if;
  update public.season_sponsorships s set status='active', delivered_from=coalesce(s.delivered_from,p_real_now), updated_at=p_real_now
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

revoke all on function public.submit_season_sponsorship(uuid,text,text,text,text,text,text,boolean,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.review_season_sponsorship(uuid,text,text,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.hold_season_sponsorship(uuid,text,boolean,integer,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_season_payment(text,text,uuid,text,integer,integer,text,boolean,boolean,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.submit_season_sponsorship(uuid,text,text,text,text,text,text,boolean,timestamptz,integer) to service_role;
grant execute on function public.review_season_sponsorship(uuid,text,text,timestamptz,integer) to service_role;
grant execute on function public.hold_season_sponsorship(uuid,text,boolean,integer,integer,integer,timestamptz) to service_role;
grant execute on function public.confirm_season_payment(text,text,uuid,text,integer,integer,text,boolean,boolean,boolean,timestamptz) to service_role;
