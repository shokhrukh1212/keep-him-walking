begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('public', 'tickets', 'Ticket purchases have their own lock table');
select has_column('public', 'country_days', 'arrival_mode', 'country days name an authoritative transfer mode');
select has_column('public', 'country_days', 'ticket_id', 'a materialized Ticket day points at its approval');
select has_function('public', 'reserve_ticket', array['uuid','text','text','text','text','text','double precision','double precision','text','text','boolean','timestamp with time zone','integer','integer'], 'the atomic Ticket reservation exists');
select has_function('public', 'approve_ticket', array['uuid','text','timestamp with time zone','integer'], 'the approval lock exists');
select is(has_function_privilege('anon', 'public.reserve_ticket(uuid,text,text,text,text,text,double precision,double precision,text,text,boolean,timestamptz,integer,integer)', 'EXECUTE'), false, 'the browser cannot reserve by RPC');
select is(has_function_privilege('service_role', 'public.reserve_ticket(uuid,text,text,text,text,text,double precision,double precision,text,text,boolean,timestamptz,integer,integer)', 'EXECUTE'), true, 'the server can reserve a Ticket');

insert into public.journeys (id,slug,title,starts_at,total_days,status,phase2_enabled,season_number)
values ('22000000-0000-4000-8000-000000000001','phase22-ticket-test','Ticket test','2035-09-01T00:00:00Z',30,'active',true,22);
insert into public.country_days (id,journey_id,day_number,country_code,country_name,city_name,time_zone,starts_at,ends_at,scene_pack_id,status)
values ('22000000-0000-4000-8000-000000000008','22000000-0000-4000-8000-000000000001',8,'UZ','Uzbekistan','Tashkent','Asia/Tashkent','2035-09-08T00:00:00Z','2035-09-09T00:00:00Z','tashkent-v5','live');
insert into public.sponsor_slots (id,journey_id,slot_date,price_cents,currency,status)
values ('22000000-0000-4000-8000-000000000011','22000000-0000-4000-8000-000000000001','2035-09-11',4900,'USD','available');

create temporary table ticket_purchase as select public.reserve_ticket(
  '22000000-0000-4000-8000-000000000011','tbilisi-v1','GE','Georgia','Tbilisi','Asia/Tbilisi',41.7151,44.8271,
  'Ticket Fixture','ticket@example.com',true,'2035-09-08T12:00:00Z',30,7
) as result;

select is((select (result ->> 'expected_price_cents')::integer from ticket_purchase),24900,'the $249 floor prices a $49 day');
select is((select (result ->> 'target_day_number')::integer from ticket_purchase),11,'the slot date resolves to Day 11');
select is((select tier from public.sponsorships where id = (select (result ->> 'sponsorship_id')::uuid from ticket_purchase)),'standard','a Ticket includes Standard sponsorship');
select is((select price_basis ->> 'product' from public.sponsorships where id = (select (result ->> 'sponsorship_id')::uuid from ticket_purchase)),'ticket','the immutable price snapshot names the product');

update public.sponsorships set status='paid_pending_review', paid_at='2035-09-08T12:01:00Z',
  private_creative_path='fixture/logo.webp', updated_at='2035-09-08T12:01:00Z'
where id=(select (result ->> 'sponsorship_id')::uuid from ticket_purchase);
create temporary table ticket_approval as select public.approve_ticket(
  (select (result ->> 'sponsorship_id')::uuid from ticket_purchase),
  'approved/logo.webp','2035-09-09T12:00:00Z',24
) as result;
select is((select result ->> 'state' from ticket_approval),'approved','creative approval fixes the Ticket');
select is((select status from public.tickets limit 1),'approved','the future-day lock becomes active only on approval');
select is((select status from public.sponsorships where id = (select (result ->> 'sponsorship_id')::uuid from ticket_purchase)),'approved','the included sponsorship is approved atomically');

create temporary table day10 as select public.create_next_country_day(
  '2035-09-09T00:00:00Z',
  jsonb_build_object('dayNumber',10,'countryCode','TJ','countryName','Tajikistan','cityName','Dushanbe','timeZone','Asia/Dushanbe','startsAt','2035-09-10T00:00:00Z','endsAt','2035-09-11T00:00:00Z','scenePackId','dushanbe-v1','storySummary','Vote destination'),
  jsonb_build_object('question','Where tomorrow?','kind','destination','opensAt','2035-09-10T00:00:00Z','closesAt','2035-09-11T00:00:00Z','options',jsonb_build_array(jsonb_build_object('label','Georgia','packId','tbilisi-v1','payload','{}'::jsonb)))
) as result;
select is((select result ->> 'voteId' from day10),null,'the vote selecting a Ticket day is skipped');
select is((select count(*) from public.votes v join public.country_days cd on cd.id=v.country_day_id where cd.day_number=10),0::bigint,'no hidden ballot is written for the fixed day');

create temporary table day11 as select public.create_next_country_day(
  '2035-09-10T00:00:00Z',
  jsonb_build_object('dayNumber',11,'countryCode','KG','countryName','Kyrgyzstan','cityName','Bishkek','timeZone','Asia/Bishkek','startsAt','2035-09-11T00:00:00Z','endsAt','2035-09-12T00:00:00Z','scenePackId','bishkek-v1','storySummary','Wrong proposal'),
  null
) as result;
select is((select result ->> 'state' from day11),'created','rollover materializes the future Ticket day');
select is((select scene_pack_id from public.country_days where day_number=11),'tbilisi-v1','the lock overrides the proposed ballot winner');
select is((select country_name from public.country_days where day_number=11),'Georgia','the approved country is authoritative');
select is((select arrival_mode from public.country_days where day_number=11),'flight','the Ticket transfer is explicitly a flight');
select isnt((select ticket_id from public.country_days where day_number=11),null,'the created day retains the approval provenance');
select is(has_function_privilege('anon', 'public.approve_ticket(uuid,text,timestamptz,integer)', 'EXECUTE'), false, 'the browser cannot approve a Ticket');

select * from finish();
rollback;
