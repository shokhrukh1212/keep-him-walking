import { describe, expect, it } from "vitest";
import { signShareToken, verifyShareToken } from "./token";

const secret = "test-share-secret-that-is-long-enough";
const now = 2_000_000_000;

describe("share tokens", () => {
  it("round-trips the confirmed steps payload", () => {
    const token = signShareToken({ v: 1, purpose: "steps", exp: now + 60, day: 6, seconds: 840, steps: 1_400 }, secret);
    expect(verifyShareToken(token, "steps", secret, now)).toEqual({ v: 1, purpose: "steps", exp: now + 60, day: 6, seconds: 840, steps: 1_400 });
  });

  it("rejects tampering, expiry, and a different card purpose", () => {
    const token = signShareToken({ v: 1, purpose: "first", exp: now + 60, day: 2, foundAt: now, waited: 420 }, secret);
    expect(verifyShareToken(`${token.slice(0, -1)}x`, "first", secret, now)).toBeNull();
    expect(verifyShareToken(token, "steps", secret, now)).toBeNull();
    expect(verifyShareToken(token, "first", secret, now + 61)).toBeNull();
  });

  it("rejects invalid or excessively long-lived numeric claims", () => {
    const invalid = signShareToken({ v: 1, purpose: "steps", exp: now + 86_401, day: 0, seconds: 1, steps: 1 }, secret);
    expect(verifyShareToken(invalid, "steps", secret, now)).toBeNull();
  });
});
