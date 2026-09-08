import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { validatePreviewSession } from "@/lib/admin/preview-auth";

afterEach(() => vi.unstubAllEnvs());

it("issues a signed HttpOnly session usable by both editor and API entry", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("PREVIEW_ACCESS_SECRET", "x".repeat(48));
  const response = await POST(new NextRequest("https://example.test/api/admin/preview/session", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({secret: "x".repeat(48), packId: "tbilisi-v1"}),
  }));
  expect(response.status).toBe(200);
  const cookie = response.cookies.get("khw_preview")!;
  expect(cookie.path).toBe("/");
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("strict");
  expect(validatePreviewSession(cookie.value)).toBe(true);
});
