/**
 * The network a request came from, as the hosting edge reports it. Callers hash it
 * with a purpose prefix before it goes anywhere; the address itself is never stored
 * or logged.
 */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
