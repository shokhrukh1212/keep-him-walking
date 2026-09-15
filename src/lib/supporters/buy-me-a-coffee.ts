import "server-only";

export type PublicSupporter = {
  id: string;
  occurredAt: string;
  displayName: string;
  coffeeCount: number | null;
};

export type PublicSupporterPage = {
  items: PublicSupporter[];
  hasEarlier: boolean;
};

const SUPPORTERS_ENDPOINT = "https://developers.buymeacoffee.com/api/v1/supporters";
const MAX_PROVIDER_PAGES = 5_000;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function firstText(row: RecordValue, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return null;
}

function firstId(row: RecordValue, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if ((typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isSafeInteger(value))) return String(value).trim();
  }
  return null;
}

function firstCount(row: RecordValue, keys: string[]): number | null {
  for (const key of keys) {
    const value = number(row[key]);
    if (value !== null) return value;
  }
  return null;
}

/** BMC omits a name for anonymous payments; older API rows use visibility 0. */
function anonymous(row: RecordValue, name: string | null): boolean {
  const visibility = row.support_visibility;
  return name === null
    || row.is_anonymous === true
    || visibility === false
    || visibility === 0
    || visibility === "0"
    || visibility === "private";
}

/** Maps only public acknowledgement fields. Emails, notes and payment details are ignored. */
export function publicSupporterFromBuyMeACoffee(value: unknown): PublicSupporter | null {
  const row = record(value);
  if (!row) return null;
  const id = firstId(row, ["supporter_id", "id"]);
  const rawDate = firstText(row, ["support_created_on", "created_at", "createdAt"]);
  if (!id || !rawDate) return null;
  const occurred = new Date(rawDate);
  if (!Number.isFinite(occurred.getTime())) return null;
  const name = firstText(row, ["supporter_name", "name"]);
  return {
    id,
    occurredAt: occurred.toISOString(),
    displayName: anonymous(row, name) ? "Anonymous supporter" : name!,
    coffeeCount: firstCount(row, ["support_coffees", "coffee_count", "coffeeCount"]),
  };
}

function providerRows(payload: unknown): unknown[] {
  const outer = record(payload);
  if (!outer) return [];
  if (Array.isArray(outer.data)) return outer.data;
  const nested = record(outer.data);
  return nested && Array.isArray(nested.data) ? nested.data : [];
}

function hasNextPage(payload: unknown): boolean {
  const outer = record(payload);
  if (!outer) return false;
  const nested = record(outer.data);
  const value = outer.next_page_url ?? nested?.next_page_url;
  return typeof value === "string" && value.length > 0;
}

export function paginateSupporters(all: PublicSupporter[], beforeId: string | null): PublicSupporterPage {
  const chronological = [...all].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  const end = beforeId === null ? chronological.length : chronological.findIndex((item) => item.id === beforeId);
  if (end < 0) throw new Error("Unknown supporter cursor.");
  const start = Math.max(0, end - 20);
  return { items: chronological.slice(start, end), hasEarlier: start > 0 };
}

/** Reads every upstream page with the creator token; it never stores provider records locally. */
export async function loadBuyMeACoffeeSupporters(accessToken: string): Promise<PublicSupporter[]> {
  const deduplicated = new Map<string, PublicSupporter>();
  for (let page = 1; page <= MAX_PROVIDER_PAGES; page += 1) {
    const url = new URL(SUPPORTERS_ENDPOINT);
    url.searchParams.set("page", String(page));
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      // Provider responses can include emails and notes. Do not persist the raw response
      // in Next's data cache; project only the public fields above for this request.
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Buy Me a Coffee supporter sync failed (${response.status}).`);
    const payload: unknown = await response.json();
    for (const row of providerRows(payload)) {
      const supporter = publicSupporterFromBuyMeACoffee(row);
      if (supporter) deduplicated.set(supporter.id, supporter);
    }
    if (!hasNextPage(payload)) return [...deduplicated.values()];
  }
  throw new Error("Buy Me a Coffee supporter sync exceeded the provider page limit.");
}
