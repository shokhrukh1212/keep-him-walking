import { describe, expect, it, vi } from "vitest";
import {
  DATAFAST_API_ORIGIN,
  DEFAULT_DATAFAST_PUBLIC_DASHBOARD_URL,
  DATAFAST_REVALIDATE_SECONDS,
  datafastAudienceUrls,
  fetchAudienceCounts,
  parseDatafastVisitors,
} from "./datafast";

const NOW = new Date("2026-09-15T12:34:56.789Z");

function visitors(count: number) {
  return { status: "success", data: [{ visitors: count }] };
}

describe("parseDatafastVisitors", () => {
  it("reads the visitor count", () => {
    expect(parseDatafastVisitors(visitors(42))).toBe(42);
    expect(parseDatafastVisitors({ status: "success", data: [{ visitors: 12450, pageviews: 16890 }] })).toBe(12450);
  });

  it("keeps a real zero", () => {
    expect(parseDatafastVisitors(visitors(0))).toBe(0);
  });

  it("refuses anything that is not a whole, non-negative count", () => {
    expect(parseDatafastVisitors(visitors(-1))).toBeNull();
    expect(parseDatafastVisitors(visitors(2.5))).toBeNull();
    expect(parseDatafastVisitors({ status: "success", data: [] })).toBeNull();
    expect(parseDatafastVisitors({ status: "success", data: [{ visitors: "7" }] })).toBeNull();
    expect(parseDatafastVisitors({ status: "error", error: { code: 401, message: "Unauthorized" } })).toBeNull();
    expect(parseDatafastVisitors(null)).toBeNull();
  });
});

describe("datafastAudienceUrls", () => {
  it("asks realtime for online and overview for the totals", () => {
    const urls = datafastAudienceUrls(NOW);
    expect(urls.online).toBe(`${DATAFAST_API_ORIGIN}/analytics/realtime?fields=visitors`);
    expect(urls.allTime).toBe(`${DATAFAST_API_ORIGIN}/analytics/overview?fields=visitors`);
  });

  it("ends the 24-hour window on a whole ten-minute boundary so it can be cached", () => {
    const window = new URL(datafastAudienceUrls(NOW).last24Hours);
    expect(window.pathname).toBe("/api/v1/analytics/overview");
    expect(window.searchParams.get("endAt")).toBe("2026-09-15T12:30:00.000Z");
    expect(window.searchParams.get("startAt")).toBe("2026-09-14T12:30:00.000Z");
    expect(datafastAudienceUrls(new Date("2026-09-15T12:39:59.999Z")).last24Hours).toBe(window.toString());
  });
});

describe("fetchAudienceCounts", () => {
  it("reads all three counts with the website key and a cache lifetime for each", async () => {
    const urls = datafastAudienceUrls(NOW);
    const answers = new Map([[urls.online, 7], [urls.last24Hours, 140], [urls.allTime, 5_210]]);
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      Response.json(visitors(answers.get(String(url)) ?? -1)));
    const counts = await fetchAudienceCounts("df_test", NOW, fetchMock);

    expect(counts).toEqual({ online: 7, last24Hours: 140, allTime: 5_210, fetchedAt: NOW.toISOString() });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const init = (url: string) => fetchMock.mock.calls.find(([called]) => called === url)?.[1] as RequestInit;
    expect(init(urls.online).headers).toMatchObject({ Authorization: "Bearer df_test" });
    expect(init(urls.online).next).toEqual({ revalidate: DATAFAST_REVALIDATE_SECONDS.online });
    expect(init(urls.allTime).next).toEqual({ revalidate: DATAFAST_REVALIDATE_SECONDS.allTime });
  });

  it("lets one failed read fail alone", async () => {
    const urls = datafastAudienceUrls(NOW);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === urls.online) return Response.json({ status: "error" }, { status: 429 });
      if (String(url) === urls.allTime) throw new TypeError("network down");
      return Response.json(visitors(140));
    });
    const counts = await fetchAudienceCounts("df_test", NOW, fetchMock as typeof fetch);
    expect(counts).toMatchObject({ online: null, last24Hours: 140, allTime: null });
  });
});

describe("publicDatafastDashboardUrl", () => {
  it("accepts only a public https DataFast page, never a private dashboard or the API", async () => {
    const { publicDatafastDashboardUrl } = await import("./datafast");
    expect(publicDatafastDashboardUrl(DEFAULT_DATAFAST_PUBLIC_DASHBOARD_URL)).toBe(DEFAULT_DATAFAST_PUBLIC_DASHBOARD_URL);
    expect(DEFAULT_DATAFAST_PUBLIC_DASHBOARD_URL).toBe("https://datafa.st/share/6aa8486bad849b7fa76ed37d");
    expect(publicDatafastDashboardUrl("https://datafa.st/dashboard/abc")).toBeNull();
    expect(publicDatafastDashboardUrl("https://datafa.st/api/v1/analytics/overview")).toBeNull();
    expect(publicDatafastDashboardUrl("http://datafa.st/share/x")).toBeNull();
    expect(publicDatafastDashboardUrl("https://example.com/share/x")).toBeNull();
    expect(publicDatafastDashboardUrl(undefined)).toBeNull();
  });
});
