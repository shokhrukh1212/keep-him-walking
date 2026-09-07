import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent } from "@/lib/analytics/server";
import { findCurrentCountryDay } from "@/lib/bootstrap/server";
import { attachVisitorCookie, visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { voteBodySchema } from "@/lib/validation/api";
import { hasTrustedOrigin } from "@/lib/validation/origin";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { withRouteTelemetry } from "@/lib/observability/route";

async function handlePost(request: NextRequest) {
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
  const currentCountryDay = await findCurrentCountryDay(now);
  const ballotNow = currentCountryDay?.story_now
    ? new Date(currentCountryDay.story_now)
    : now;
  const limit = await consumeRateLimit(visitorHash, RATE_LIMITS.vote, now);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Too many vote attempts.");

  const { data, error } = await supabase.rpc("submit_phase1_ballot", {
    p_vote_id: parsed.data.voteId,
    p_option_id: parsed.data.optionId,
    p_visitor_hash: visitorHash,
    p_now: ballotNow.toISOString(),
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

export const POST = withRouteTelemetry("votes", handlePost);
