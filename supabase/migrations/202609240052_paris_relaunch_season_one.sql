-- Corrects migration 202609190049's automatic next-season numbering for the
-- Paris relaunch. The older completed journey was a rehearsal; this public
-- launch is Season 1. Journey identity remains its UUID, not season_number.
update public.journeys
set season_number = 1, updated_at = now()
where slug = 'paris-relaunch'
  and season_number <> 1;
