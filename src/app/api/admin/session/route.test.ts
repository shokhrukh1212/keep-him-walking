import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { validateAdminSession } from "@/lib/admin/admin-auth";

vi.mock("@/lib/security/rate-limit", async (original) => ({
  ...await original<typeof import("@/lib/security/rate-limit")>(), consumeRateLimit: vi.fn(),
}));
const secret = "test-admin-secret-that-is-longer-than-forty-eight-characters";
beforeEach(() => {
  vi.stubEnv("ADMIN_ACCESS_SECRET", secret);
  vi.stubEnv("VISITOR_HASH_SECRET", "test-visitor-hash-secret-that-is-long-enough-to-be-valid");
  vi.mocked(consumeRateLimit).mockResolvedValue({ configured: true, allowed: true, retryAfterSeconds: 3600 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const request = (value = secret, origin = "https://example.test") => new NextRequest("https://example.test/api/admin/session", {
  method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": "192.0.2.1" }, body: JSON.stringify({ secret: value }),
});

it("offers a sign-in page on GET and only creates a session after an authenticated POST", async () => {
  expect(GET(new NextRequest("https://example.test/api/admin/session")).headers.get("location")).toBe("https://example.test/admin-login");
  const response = await POST(request());
  expect(response.status).toBe(200);
  const cookie = response.cookies.get("khw_admin")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("strict");
  expect(cookie.maxAge).toBe(43200);
  expect(validateAdminSession(cookie.value)).toBe(true);
  const [key, policy] = vi.mocked(consumeRateLimit).mock.calls[0];
  expect(key).not.toContain("192.0.2.1");
  expect(policy).toMatchObject({ limit: 5, windowSeconds: 3600 });
});

it("rejects wrong credentials and cross-origin requests and enforces the access limit", async () => {
  expect((await POST(request("incorrect"))).status).toBe(404);
  expect((await POST(request(secret, "https://untrusted.test"))).status).toBe(404);
  vi.mocked(consumeRateLimit).mockResolvedValue({ configured: true, allowed: false, retryAfterSeconds: 123 });
  const limited = await POST(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("123");
  expect(limited.cookies.get("khw_admin")).toBeUndefined();
});
