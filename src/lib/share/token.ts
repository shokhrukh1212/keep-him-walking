import { createHmac, timingSafeEqual } from "node:crypto";

export type StepsSharePayload = { v: 1; purpose: "steps"; exp: number; day: number; seconds: number; steps: number };
export type FirstSharePayload = { v: 1; purpose: "first"; exp: number; day: number; foundAt: number; waited: number };
export type SharePayload = StepsSharePayload | FirstSharePayload;

function signature(encoded: string, secret: string) {
  return createHmac("sha256", secret).update(`khw-share-v1.${encoded}`).digest("base64url");
}

export function signShareToken(payload: SharePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyShareToken<P extends SharePayload["purpose"]>(
  token: string,
  purpose: P,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Extract<SharePayload, { purpose: P }> | null {
  const [encoded, received, extra] = token.split(".");
  if (!encoded || !received || extra) return null;
  const expected = signature(encoded, secret);
  if (received.length !== expected.length
    || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SharePayload;
    if (value.v !== 1 || value.purpose !== purpose || !Number.isInteger(value.exp)
      || value.exp <= nowSeconds || value.exp > nowSeconds + 86_400) return null;
    const valid = value.purpose === "steps"
      ? Number.isInteger(value.day) && value.day > 0
        && Number.isInteger(value.seconds) && value.seconds >= 0
        && Number.isInteger(value.steps) && value.steps >= 0
      : Number.isInteger(value.day) && value.day > 0
        && Number.isInteger(value.foundAt) && value.foundAt >= 0
        && Number.isInteger(value.waited) && value.waited >= 0;
    if (!valid) return null;
    return value as Extract<SharePayload, { purpose: P }>;
  } catch {
    return null;
  }
}
