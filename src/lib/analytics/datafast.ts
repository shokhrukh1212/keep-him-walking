import { z } from "zod";

/**
 * Visitor counts from DataFast, the site's page analytics. These count people who
 * loaded a page, not the server-confirmed watchers whose presence keeps him walking.
 */
export type AudienceCounts = {
  /** Visitors with a pageview in the last ten minutes (DataFast's "realtime"). */
  online: number | null;
  /** Unique visitors in the 24 hours up to the latest whole ten-minute boundary. */
  last24Hours: number | null;
  /** Unique visitors since tracking began. */
  allTime: number | null;
  fetchedAt: string;
};

export const DATAFAST_API_ORIGIN = "https://datafa.st/api/v1";

/**
 * The first day DataFast recorded a visit for keephimwalking.com (Asia/Tashkent calendar),
 * read from its daily timeseries on 16 September 2026; the script shipped on 15 September.
 */
export const DATAFAST_TRACKING_STARTED_ON = "2026-09-15";

const DATAFAST_HOSTS = new Set(["datafa.st", "www.datafa.st"]);

/** The owner's PUBLIC DataFast dashboard link, or null. A private app URL is never shown. */
export function publicDatafastDashboardUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !DATAFAST_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return null;
    if (url.pathname === "/" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * How long Next.js's shared fetch cache may reuse each read, in seconds. Every server
 * instance shares these entries, which keeps the site far inside DataFast's 60 requests
 * a minute however many people load the page.
 */
export const DATAFAST_REVALIDATE_SECONDS = { online: 30, last24Hours: 600, allTime: 600 } as const;

type AudienceKey = keyof typeof DATAFAST_REVALIDATE_SECONDS;

const REQUEST_TIMEOUT_MS = 4_000;
const DAY_MS = 86_400_000;

const visitorsResponseSchema = z.object({
  status: z.literal("success"),
  data: z.array(z.object({ visitors: z.number() })).min(1),
});

/** Reads `data[0].visitors`. Anything malformed or negative yields null, never a guess. */
export function parseDatafastVisitors(payload: unknown): number | null {
  const parsed = visitorsResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const visitors = parsed.data.data[0]?.visitors;
  return visitors !== undefined && Number.isInteger(visitors) && visitors >= 0 ? visitors : null;
}

/** The three reads behind `AudienceCounts`. Omitting the dates asks for all time. */
export function datafastAudienceUrls(now: Date): Record<AudienceKey, string> {
  // Whole ten-minute windows keep the URL, and so its cache entry, the same between reads.
  const windowMs = DATAFAST_REVALIDATE_SECONDS.last24Hours * 1_000;
  const endAt = Math.floor(now.getTime() / windowMs) * windowMs;
  const last24Hours = new URLSearchParams({
    fields: "visitors",
    startAt: new Date(endAt - DAY_MS).toISOString(),
    endAt: new Date(endAt).toISOString(),
  });
  return {
    online: `${DATAFAST_API_ORIGIN}/analytics/realtime?fields=visitors`,
    last24Hours: `${DATAFAST_API_ORIGIN}/analytics/overview?${last24Hours}`,
    allTime: `${DATAFAST_API_ORIGIN}/analytics/overview?fields=visitors`,
  };
}

/**
 * Reads all three counts with a website API key (`df_…`). Each count fails on its
 * own: a timeout, an error status or an unexpected body leaves that one null.
 */
export async function fetchAudienceCounts(
  apiKey: string,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<AudienceCounts> {
  const urls = datafastAudienceUrls(now);
  const read = async (key: AudienceKey): Promise<number | null> => {
    try {
      const response = await fetchImpl(urls[key], {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        next: { revalidate: DATAFAST_REVALIDATE_SECONDS[key] },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      return parseDatafastVisitors(await response.json());
    } catch {
      return null;
    }
  };
  const [online, last24Hours, allTime] = await Promise.all([
    read("online"),
    read("last24Hours"),
    read("allTime"),
  ]);
  return { online, last24Hours, allTime, fetchedAt: now.toISOString() };
}
