import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, issueAdminSession, validateAdminCredential } from "@/lib/admin/admin-auth";
import { hashOpaqueValue } from "@/lib/identity/server";
import { RATE_LIMITS, consumeRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

const bodySchema = z.object({ secret: z.string().min(1).max(512) });

function protectedClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return hashOpaqueValue(`admin-access:${address}`);
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limit = await consumeRateLimit(protectedClientKey(request), RATE_LIMITS.adminAccess);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds, "Too many access attempts.");
  let body: unknown;
  try { body = await readLimitedJson(request, 1_024); } catch { return NextResponse.json({ error: "Not found." }, { status: 404 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !validateAdminCredential(parsed.data.secret)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const response = NextResponse.json({ authenticated: true, path: "/admin" }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, issueAdminSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
