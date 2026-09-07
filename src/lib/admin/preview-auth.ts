import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_VERSION = "v1";

export function previewEnabled() {
  return process.env.VERCEL_ENV !== "production" && Boolean(process.env.PREVIEW_ACCESS_SECRET);
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(`${COOKIE_VERSION}.${expiresAt}`).digest("hex");
}

export function issuePreviewSession(now = new Date(), durationSeconds = 4 * 60 * 60) {
  const secret = process.env.PREVIEW_ACCESS_SECRET;
  if (!previewEnabled() || !secret || secret.length < 32) throw new Error("PREVIEW_DISABLED");
  const expiresAt = String(Math.floor(now.getTime() / 1000) + durationSeconds);
  return `${COOKIE_VERSION}.${expiresAt}.${signature(expiresAt, secret)}`;
}

export function validatePreviewSession(value: string | undefined, now = new Date()) {
  const secret = process.env.PREVIEW_ACCESS_SECRET;
  if (!previewEnabled() || !secret || !value) return false;
  const [version, expiresAt, received] = value.split(".");
  if (version !== COOKIE_VERSION || !expiresAt || !received || Number(expiresAt) <= Math.floor(now.getTime() / 1000)) return false;
  const expected = signature(expiresAt, secret);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function validatePreviewCredential(received: string | null) {
  const expected = process.env.PREVIEW_ACCESS_SECRET;
  if (!previewEnabled() || !expected || !received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
