-- Corrects the P8 crowd threshold so the common one-watcher room can use the
-- three reaction controls. Zero confirmed watchers still cannot schedule an action.

create or replace function public.reaction_threshold(p_live_watchers bigint)
returns integer
language sql
immutable
as $$
  select case
    when greatest(coalesce(p_live_watchers, 0), 0) = 1 then 1
    else greatest(2, ceil(0.3 * greatest(coalesce(p_live_watchers, 0), 0))::integer)
  end;
$$;

comment on function public.reaction_threshold(bigint) is
  'One confirmed watcher may act; larger rooms require at least two or 30 percent.';
