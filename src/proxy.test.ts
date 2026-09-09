import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { issueAdminSession } from "@/lib/admin/admin-auth";
import { config, proxy } from "./proxy";

const original = process.env.ADMIN_ACCESS_SECRET;
const secret = "a-production-length-admin-access-secret-with-48-characters-plus";

describe("admin proxy", () => {
  beforeEach(() => { process.env.ADMIN_ACCESS_SECRET = secret; });
  afterEach(() => { process.env.ADMIN_ACCESS_SECRET = original; });

  it("matches HTML admin routes without intercepting the admin API", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/admin" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/admin/postkit/1" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/admin/session" })).toBe(false);
  });

  it("returns a hard 404 until the request carries a valid session", () => {
    const denied = proxy(new NextRequest("https://example.test/admin"));
    expect(denied.status).toBe(404);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");

    const session = issueAdminSession();
    const allowed = proxy(new NextRequest("https://example.test/admin", {
      headers: { cookie: `khw_admin=${session}` },
    }));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
  });
});
