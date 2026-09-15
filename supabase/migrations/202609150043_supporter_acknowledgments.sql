-- Buy Me a Coffee acknowledgments.
--
-- Provider exports and private supporter details stay in this service-only ledger.
-- A row can become public only after the contribution is verified and the supporter
-- has separately permitted acknowledgment on Keep Him Walking. Coffee counts are
-- optional: callers may store a count only when the source supplies one directly.

create table public.supporter_contributions (
  id bigint generated always as identity primary key,
  source text not null check (source in ('manual', 'buy_me_a_coffee')),
  external_transaction_id text,
  occurred_at timestamptz not null,
  display_name text check (
    display_name is null
    or (char_length(display_name) between 1 and 100 and display_name = btrim(display_name))
  ),
  is_anonymous boolean not null default false,
  coffee_count integer check (coffee_count is null or coffee_count between 1 and 10000),
  x_url text check (
    x_url is null
    or x_url ~ '^https://(www\.)?(x\.com|twitter\.com)/[^/?#[:space:]]+/?$'
  ),
  x_verified boolean not null default false,
  startup_url text check (
    startup_url is null
    or (char_length(startup_url) <= 300
      and startup_url ~ '^https://[^/?#@[:space:]]+\.[^/?#@[:space:]]+([/?#][^[:space:]]*)?$')
  ),
  startup_verified boolean not null default false,
  private_email text check (private_email is null or char_length(private_email) <= 254),
  private_payment_id text check (private_payment_id is null or char_length(private_payment_id) <= 200),
  private_message text check (private_message is null or char_length(private_message) <= 5000),
  payment_verified boolean not null default false,
  acknowledgment_permission boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'removed')),
  approved_at timestamptz,
  published_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source <> 'buy_me_a_coffee' or nullif(btrim(external_transaction_id), '') is not null),
  check (not x_verified or x_url is not null),
  check (not startup_verified or startup_url is not null),
  check (status <> 'published' or (
    payment_verified
    and acknowledgment_permission
    and (is_anonymous or display_name is not null)
    and approved_at is not null
    and published_at is not null
  )),
  check (status <> 'removed' or removed_at is not null)
);

create unique index supporter_contributions_source_transaction_idx
  on public.supporter_contributions (source, external_transaction_id)
  where external_transaction_id is not null;
create index supporter_contributions_public_feed_idx
  on public.supporter_contributions (occurred_at desc, id desc)
  where status = 'published';

alter table public.supporter_contributions enable row level security;
revoke all on table public.supporter_contributions from anon, authenticated;
grant select, insert, update on table public.supporter_contributions to service_role;
grant usage, select on sequence public.supporter_contributions_id_seq to service_role;

create or replace function public.import_supporter_contributions(
  p_rows jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_external_id text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
    or jsonb_array_length(p_rows) > 2000 then
    raise exception 'invalid supporter import batch' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(btrim(v_row ->> 'externalTransactionId'), '');
    if v_external_id is null then
      raise exception 'imported contribution needs a transaction id' using errcode = '22023';
    end if;

    insert into public.supporter_contributions (
      source, external_transaction_id, occurred_at, display_name, is_anonymous,
      coffee_count, x_url, startup_url, private_email, private_payment_id,
      private_message, created_at, updated_at
    ) values (
      'buy_me_a_coffee', v_external_id, (v_row ->> 'occurredAt')::timestamptz,
      nullif(btrim(v_row ->> 'displayName'), ''), coalesce((v_row ->> 'isAnonymous')::boolean, false),
      (v_row ->> 'coffeeCount')::integer, nullif(btrim(v_row ->> 'xUrl'), ''),
      nullif(btrim(v_row ->> 'startupUrl'), ''), nullif(btrim(v_row ->> 'privateEmail'), ''),
      nullif(btrim(v_row ->> 'privatePaymentId'), ''), nullif(v_row ->> 'privateMessage', ''),
      p_now, p_now
    )
    on conflict (source, external_transaction_id) where external_transaction_id is not null
    do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_duplicates := v_duplicates + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates);
end;
$$;

create or replace function public.save_supporter_contribution(
  p_id bigint,
  p_source text,
  p_external_transaction_id text,
  p_occurred_at timestamptz,
  p_display_name text,
  p_is_anonymous boolean,
  p_coffee_count integer,
  p_x_url text,
  p_x_verified boolean,
  p_startup_url text,
  p_startup_verified boolean,
  p_private_email text,
  p_private_payment_id text,
  p_private_message text,
  p_payment_verified boolean,
  p_acknowledgment_permission boolean,
  p_now timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  if p_source not in ('manual', 'buy_me_a_coffee') then
    raise exception 'invalid supporter source' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.supporter_contributions (
      source, external_transaction_id, occurred_at, display_name, is_anonymous,
      coffee_count, x_url, x_verified, startup_url, startup_verified, private_email,
      private_payment_id, private_message, payment_verified,
      acknowledgment_permission, created_at, updated_at
    ) values (
      p_source, nullif(btrim(p_external_transaction_id), ''), p_occurred_at,
      nullif(btrim(p_display_name), ''), p_is_anonymous, p_coffee_count,
      nullif(btrim(p_x_url), ''), p_x_verified, nullif(btrim(p_startup_url), ''),
      p_startup_verified, nullif(btrim(p_private_email), ''),
      nullif(btrim(p_private_payment_id), ''), nullif(p_private_message, ''),
      p_payment_verified, p_acknowledgment_permission, p_now, p_now
    ) returning id into v_id;
    return v_id;
  end if;

  select c.id into v_id
  from public.supporter_contributions c
  where c.id = p_id
  for update;
  if not found then
    raise exception 'unknown supporter contribution' using errcode = 'P0002';
  end if;

  update public.supporter_contributions c
  set source = p_source,
      external_transaction_id = nullif(btrim(p_external_transaction_id), ''),
      occurred_at = p_occurred_at,
      display_name = nullif(btrim(p_display_name), ''),
      is_anonymous = p_is_anonymous,
      coffee_count = p_coffee_count,
      x_url = nullif(btrim(p_x_url), ''),
      x_verified = p_x_verified,
      startup_url = nullif(btrim(p_startup_url), ''),
      startup_verified = p_startup_verified,
      private_email = nullif(btrim(p_private_email), ''),
      private_payment_id = nullif(btrim(p_private_payment_id), ''),
      private_message = nullif(p_private_message, ''),
      payment_verified = p_payment_verified,
      acknowledgment_permission = p_acknowledgment_permission,
      status = case when c.status = 'published' then 'draft' else c.status end,
      approved_at = case when c.status = 'published' then null else c.approved_at end,
      published_at = case when c.status = 'published' then null else c.published_at end,
      updated_at = p_now
  where c.id = p_id;
  return p_id;
end;
$$;

create or replace function public.set_supporter_contribution_status(
  p_id bigint,
  p_action text,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.supporter_contributions%rowtype;
begin
  select * into v_row
  from public.supporter_contributions c
  where c.id = p_id
  for update;
  if not found then
    raise exception 'unknown supporter contribution' using errcode = 'P0002';
  end if;

  if p_action = 'publish' then
    if not v_row.payment_verified or not v_row.acknowledgment_permission
      or (not v_row.is_anonymous and v_row.display_name is null) then
      raise exception 'supporter acknowledgment is not approved' using errcode = '55000';
    end if;
    update public.supporter_contributions c
    set status = 'published', approved_at = p_now, published_at = p_now,
        removed_at = null, updated_at = p_now
    where c.id = p_id;
    return 'published';
  elsif p_action = 'unpublish' then
    update public.supporter_contributions c
    set status = 'draft', approved_at = null, published_at = null,
        removed_at = null, updated_at = p_now
    where c.id = p_id;
    return 'draft';
  elsif p_action = 'remove' then
    update public.supporter_contributions c
    set status = 'removed', published_at = null, removed_at = p_now, updated_at = p_now
    where c.id = p_id;
    return 'removed';
  end if;

  raise exception 'invalid supporter action' using errcode = '22023';
end;
$$;

create or replace function public.read_published_supporters(
  p_before_at timestamptz,
  p_before_id bigint,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_limit < 1 or p_limit > 50
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'invalid supporter page' using errcode = '22023';
  end if;

  with newest as (
    select c.id, c.occurred_at,
      case when c.is_anonymous then 'Anonymous supporter' else c.display_name end as display_name,
      c.coffee_count,
      case when not c.is_anonymous and c.x_verified then c.x_url else null end as x_url,
      case when not c.is_anonymous and c.startup_verified then c.startup_url else null end as startup_url,
      row_number() over (order by c.occurred_at desc, c.id desc) as page_row
    from public.supporter_contributions c
    where c.status = 'published'
      and (p_before_at is null or (c.occurred_at, c.id) < (p_before_at, p_before_id))
    order by c.occurred_at desc, c.id desc
    limit p_limit + 1
  ), page as (
    select * from newest where page_row <= p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'occurredAt', page.occurred_at,
      'displayName', page.display_name,
      'coffeeCount', page.coffee_count,
      'xUrl', page.x_url,
      'startupUrl', page.startup_url
    ) order by page.occurred_at, page.id), '[]'::jsonb),
    'hasEarlier', exists(select 1 from newest where page_row > p_limit)
  ) into v_result
  from page;

  return v_result;
end;
$$;

revoke all on function public.import_supporter_contributions(jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.save_supporter_contribution(bigint,text,text,timestamptz,text,boolean,integer,text,boolean,text,boolean,text,text,text,boolean,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.set_supporter_contribution_status(bigint,text,timestamptz) from public, anon, authenticated;
revoke all on function public.read_published_supporters(timestamptz,bigint,integer) from public, anon, authenticated;
grant execute on function public.import_supporter_contributions(jsonb,timestamptz) to service_role;
grant execute on function public.save_supporter_contribution(bigint,text,text,timestamptz,text,boolean,integer,text,boolean,text,boolean,text,text,text,boolean,boolean,timestamptz) to service_role;
grant execute on function public.set_supporter_contribution_status(bigint,text,timestamptz) to service_role;
grant execute on function public.read_published_supporters(timestamptz,bigint,integer) to service_role;
