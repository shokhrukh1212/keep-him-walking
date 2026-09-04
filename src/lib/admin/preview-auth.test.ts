import { afterEach, describe, expect, it } from "vitest";
import { issuePreviewSession, validatePreviewCredential, validatePreviewSession } from "./preview-auth";

const original = { env: process.env.VERCEL_ENV, secret: process.env.PREVIEW_ACCESS_SECRET };
afterEach(() => { process.env.VERCEL_ENV = original.env; process.env.PREVIEW_ACCESS_SECRET = original.secret; });

describe("preview authentication", () => {
  it("is signed, expiring and disabled in Production", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_ACCESS_SECRET = "a".repeat(32);
    const now = new Date("2026-09-04T00:00:00Z");
    const session = issuePreviewSession(now, 60);
    expect(validatePreviewSession(session, new Date(now.getTime() + 59_000))).toBe(true);
    expect(validatePreviewSession(session, new Date(now.getTime() + 61_000))).toBe(false);
    expect(validatePreviewCredential("a".repeat(32))).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(validatePreviewSession(session, now)).toBe(false);
  });
});
