const BUY_ME_A_COFFEE_HOSTS = new Set(["buymeacoffee.com", "www.buymeacoffee.com"]);

/** Only a real Buy Me a Coffee profile URL is allowed into the public footer. */
export function configuredCoffeeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !BUY_ME_A_COFFEE_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.username || url.password || url.pathname === "/" || url.pathname.split("/").filter(Boolean).length !== 1) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Kept server-only by its caller; whitespace-only values must not pretend sync is configured. */
export function configuredCoffeeAccessToken(value: string | undefined): string | null {
  const token = value?.trim();
  return token || null;
}
