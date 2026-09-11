-- Adds the reviewed overland transfer used by the London-to-Paris launch leg.
-- Flight and walk remain valid for existing days and Ticket purchases.

alter table public.country_days
  drop constraint country_days_arrival_mode_check;

alter table public.country_days
  add constraint country_days_arrival_mode_check
  check (arrival_mode in ('walk', 'train', 'flight'));

comment on column public.country_days.arrival_mode is
  'Authoritative transfer from the previous day: walk, train, or flight.';
