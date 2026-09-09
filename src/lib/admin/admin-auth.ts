import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "khw_admin";
const VERSION = "v1";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

function configuredSecret() {
  const value = process.env.ADMIN_ACCESS_SECRET;
  return value && value.length >= 48 ? value : null;
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(`khw-admin.${VERSION}.${expiresAt}`).digest("hex");
}

export function validateAdminCredential(received: string | null) {
  const expected = configuredSecret();
  if (!expected || !received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function issueAdminSession(now = new Date(), durationSeconds = MAX_SESSION_SECONDS) {
  const secret = configuredSecret();
  if (!secret) throw new Error("ADMIN_ACCESS_SECRET must contain at least 48 characters");
  const seconds = Math.min(MAX_SESSION_SECONDS, Math.max(60, Math.floor(durationSeconds)));
  const expiresAt = String(Math.floor(now.getTime() / 1_000) + seconds);
  return `${VERSION}.${expiresAt}.${signature(expiresAt, secret)}`;
}

export function validateAdminSession(value: string | undefined, now = new Date()) {
  const secret = configuredSecret();
  if (!secret || !value) return false;
  const [version, expiresAt, received, extra] = value.split(".");
  const expiry = Number(expiresAt);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (version !== VERSION || !expiresAt || !received || extra
    || !Number.isInteger(expiry) || expiry <= nowSeconds
    || expiry > nowSeconds + MAX_SESSION_SECONDS) return false;
  const expected = signature(expiresAt, secret);
  return received.length === expected.length
    && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
