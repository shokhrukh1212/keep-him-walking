import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issuePreviewSession } from "@/lib/admin/preview-auth";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());
const params = Promise.resolve({packId: "tbilisi-v1"});
it("returns stage JSON to API clients and directs signed browsers to the local editor", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("PREVIEW_ACCESS_SECRET", "x".repeat(48));
  const url = "https://example.test/api/admin/preview/tbilisi-v1?zone=dry-bridge";
  const api = await GET(new NextRequest(url, {headers: {authorization: `Bearer ${"x".repeat(48)}`}}), {params});
  expect(api.status).toBe(200);
  expect((await api.json()).zone.stage.groundLineY).toBe(0.85);
  const browser = await GET(new NextRequest(url, {headers: {accept: "text/html", cookie: `khw_preview=${issuePreviewSession()}`}}), {params});
  expect(browser.status).toBe(307);
  expect(browser.headers.get("location")).toBe("https://example.test/preview/tbilisi-v1?calibrate=1&zone=dry-bridge");
  expect(browser.headers.get("cache-control")).toContain("no-store");
});
it("hides the editor from unauthenticated and production requests", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("PREVIEW_ACCESS_SECRET", "x".repeat(48));
  const url = "https://example.test/api/admin/preview/tbilisi-v1";
  expect((await GET(new NextRequest(url), {params})).status).toBe(404);
  const session = issuePreviewSession();
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await GET(new NextRequest(url, {headers: {authorization: `Bearer ${"x".repeat(48)}`, cookie: `khw_preview=${session}`}}), {params})).status).toBe(404);
});
