/**
 * The edge tells us which country a request came from. We keep the two-letter
 * code and nothing else: no IP is read, stored, or logged anywhere in this path.
 */
export const UNKNOWN_COUNTRY_CODE = "ZZ";

export const COUNTRY_HEADER = "x-vercel-ip-country";

/** Normalizes an edge header into a storable code. Anything malformed is unknown. */
export function countryFromHeader(value: string | null | undefined): string {
  if (typeof value !== "string") return UNKNOWN_COUNTRY_CODE;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : UNKNOWN_COUNTRY_CODE;
}
