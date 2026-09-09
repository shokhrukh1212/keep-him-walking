import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueAdminSession, validateAdminCredential, validateAdminSession } from "./admin-auth";

const original = process.env.ADMIN_ACCESS_SECRET;
const secret = "a-production-length-admin-access-secret-with-48-characters-plus";

describe("admin auth", () => {
  beforeEach(() => { process.env.ADMIN_ACCESS_SECRET = secret; });
  afterEach(() => { process.env.ADMIN_ACCESS_SECRET = original; });

  it("compares credentials and signs a 12-hour session", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    const session = issueAdminSession(now);
    expect(validateAdminCredential(secret)).toBe(true);
    expect(validateAdminCredential(`${secret}x`)).toBe(false);
    expect(validateAdminSession(session, new Date("2026-09-09T23:59:59Z"))).toBe(true);
    expect(validateAdminSession(session, new Date("2026-09-10T00:00:01Z"))).toBe(false);
  });

  it("rejects tampering and short configuration", () => {
    const session = issueAdminSession();
    const replacement = session.endsWith("0") ? "1" : "0";
    expect(validateAdminSession(`${session.slice(0, -1)}${replacement}`)).toBe(false);
    process.env.ADMIN_ACCESS_SECRET = "short";
    expect(validateAdminCredential("short")).toBe(false);
  });
});
