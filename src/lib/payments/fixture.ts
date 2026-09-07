import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { fixturePaymentsAllowed } from "@/lib/config/phase2-policy";

type FixtureClaims = {
  sponsorshipId: string;
  expiresAt: string;
  returnUrl: string;
};

function fixtureSecret(): string {
  if (!fixturePaymentsAllowed()) throw new Error("FIXTURE_PAYMENT_FORBIDDEN");
  return process.env.SPONSOR_FIXTURE_SECRET!;
}

function signature(payload: string): string {
  return createHmac("sha256", fixtureSecret()).update(payload).digest("base64url");
}

export function createFixtureToken(claims: FixtureClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyFixtureToken(token: string): FixtureClaims | null {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FixtureClaims;
    if (!claims.sponsorshipId || !claims.returnUrl || Date.parse(claims.expiresAt) <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
