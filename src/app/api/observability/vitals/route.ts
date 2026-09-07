import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { visitorFromRequest } from "@/lib/identity/cookie";
import { hashOpaqueValue } from "@/lib/identity/server";
import { writeOperationalLog } from "@/lib/observability/logger";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { readLimitedJson } from "@/lib/validation/http";

const vitalSchema = z.object({
  id: z.string().max(128),
  name: z.enum(["TTFB", "FCP", "LCP", "FID", "CLS", "INP"]),
  value: z.number().finite().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigationType: z.string().max(32),
});

export async function POST(request: NextRequest) {
  let candidate: unknown;
  try { candidate = await readLimitedJson(request, 2_048); } catch { return new NextResponse(null, { status: 400 }); }
  const parsed = vitalSchema.safeParse(candidate);
  if (!parsed.success) return new NextResponse(null, { status: 422 });
  const visitor = visitorFromRequest(request);
  const limit = await consumeRateLimit(hashOpaqueValue(visitor.visitorId), { action: "web_vital", limit: 30, windowSeconds: 300 });
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  await writeOperationalLog(parsed.data.rating === "poor" ? "warning" : "info", "web_vital", parsed.data);
  return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
}
