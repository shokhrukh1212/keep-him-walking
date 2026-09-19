-- The name ballot RPC returned only the grand total, so the browser could show
-- "1 people have voted" while every option still read "0 votes" until the next
-- bootstrap. Corrects 202609190049 by returning the per-option tallies the
-- accepted ballot produced, in the same locked transaction that counted them.

create or replace function public.submit_journey_name_ballot(
  p_vote_id uuid,
  p_option_id uuid,
  p_voter_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vote public.journey_name_votes%rowtype;
  v_total bigint;
  v_tallies jsonb;
begin
  if length(p_voter_hash) <> 64 then raise exception 'invalid voter' using errcode = '22023'; end if;
  select * into v_vote from public.journey_name_votes v where v.id = p_vote_id for update;
  if not found or v_vote.status <> 'open' then raise exception 'vote is not open' using errcode = '55000'; end if;
  if not exists (select 1 from public.journey_name_vote_options o where o.id = p_option_id and o.vote_id = p_vote_id) then
    raise exception 'invalid option' using errcode = '22023';
  end if;
  insert into public.journey_name_ballots (vote_id, voter_hash, option_id, created_at)
  values (p_vote_id, p_voter_hash, p_option_id, p_now)
  on conflict (vote_id, voter_hash) do update set option_id = excluded.option_id, created_at = excluded.created_at;
  select count(*) into v_total from public.journey_name_ballots b where b.vote_id = p_vote_id;
  select coalesce(jsonb_agg(jsonb_build_object('optionId', t.id, 'votes', t.votes)
      order by t.display_order), '[]'::jsonb)
    into v_tallies
    from (
      select o.id, o.display_order,
        (select count(*) from public.journey_name_ballots b where b.option_id = o.id) votes
      from public.journey_name_vote_options o
      where o.vote_id = p_vote_id
    ) t;
  return jsonb_build_object('state', 'accepted', 'voteId', p_vote_id,
    'optionId', p_option_id, 'totalBallots', v_total, 'tallies', v_tallies);
end;
$$;

revoke execute on function public.submit_journey_name_ballot(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.submit_journey_name_ballot(uuid, uuid, text, timestamptz) to service_role;
