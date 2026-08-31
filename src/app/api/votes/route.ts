import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { voteBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  const parsed = voteBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Voting is not configured." }, { status: 503 });
  }
  const visitor = visitorFromRequest(request);
  const visitorHash = hashOpaqueValue(visitor.visitorId);
  const now = new Date();
  const { data: allowed, error: rateError } = await supabase.rpc(
    "consume_mutation_rate_limit",
    {
      p_key_hash: visitorHash,
      p_action: "vote",
      p_limit: 10,
      p_window_seconds: 60,
      p_now: now.toISOString(),
    },
  );
  if (rateError || !allowed) {
    return NextResponse.json({ error: "Too many vote attempts." }, { status: 429 });
  }

  const { data, error } = await supabase.rpc("submit_phase1_ballot", {
    p_vote_id: parsed.data.voteId,
    p_option_id: parsed.data.optionId,
    p_visitor_hash: visitorHash,
    p_now: now.toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: "Vote could not be accepted." }, { status: 409 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.out_accepted) {
    return NextResponse.json(
      {
        error: "This visitor has already voted for another option.",
        selectedOptionId: row?.out_option_id ?? null,
      },
      { status: 409 },
    );
  }
  if (!row.out_idempotent) {
    trackServerEvent("vote_submitted", visitorHash, {
      vote_id: parsed.data.voteId,
      option_id: parsed.data.optionId,
    });
  }
  const response = NextResponse.json({
    accepted: true,
    idempotent: Boolean(row.out_idempotent),
    selectedOptionId: String(row.out_option_id),
    totalBallots: Number(row.out_total_ballots),
  });
  attachVisitorCookie(response, visitor.visitorId, visitor.isNew);
  return response;
}
