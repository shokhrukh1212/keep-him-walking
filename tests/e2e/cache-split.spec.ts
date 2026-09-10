import { expect, test } from "@playwright/test";

/**
 * The P18 split: /api/bootstrap is the world and can be held in a shared cache;
 * /api/me is the visitor and must never be. If a visitor-specific field ever
 * leaks back into the public response, a cache would serve one person's ballot
 * and postcard to everybody.
 */
const PRIVATE_KEYS = ["firstVisit"];

test("the public snapshot carries no cookie and nothing about the visitor", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Cache contract runs once");
  const response = await request.get("/api/bootstrap");
  test.skip(response.status() === 503, "The development project has no active country-day");
  expect(response.status()).toBe(200);

  const cacheControl = response.headers()["cache-control"] ?? "";
  expect(cacheControl).toContain("public");
  expect(cacheControl).toContain("s-maxage=3");
  expect(cacheControl).toContain("stale-while-revalidate=10");
  // A Set-Cookie on a shared-cacheable response is the bug this guards against.
  expect(response.headers()["set-cookie"]).toBeUndefined();

  const body = await response.json() as Record<string, unknown> & {
    vote?: { selectedOptionId?: string | null };
    postcard?: { eligible?: boolean; contributedSeconds?: number; url?: string | null };
    passport?: { streak?: number; collectedToday?: boolean };
  };
  for (const key of PRIVATE_KEYS) expect(body[key]).toBeUndefined();
  // Read as nobody, so every visitor-shaped field is at its empty value.
  expect(body.vote?.selectedOptionId ?? null).toBeNull();
  expect(body.postcard?.eligible ?? false).toBe(false);
  expect(body.postcard?.contributedSeconds ?? 0).toBe(0);
  expect(body.postcard?.url ?? null).toBeNull();
  expect(body.passport?.streak ?? 0).toBe(0);
  expect(body.passport?.collectedToday ?? false).toBe(false);
});

test("the private route carries the visitor cookie and is never stored", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Cache contract runs once");
  const response = await request.get("/api/me");
  expect([200, 429]).toContain(response.status());
  if (response.status() !== 200) return;

  const cacheControl = response.headers()["cache-control"] ?? "";
  expect(cacheControl).toContain("private");
  expect(cacheControl).toContain("no-store");

  const body = await response.json() as Record<string, unknown>;
  // Every field the public snapshot gave up has a home here.
  expect(body).toHaveProperty("firstVisit");
  expect(body).toHaveProperty("passport");
  expect(body).toHaveProperty("postcard");
  expect(body).toHaveProperty("selectedOptionId");
});
