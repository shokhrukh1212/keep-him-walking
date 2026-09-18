/**
 * "Shown once, ever" for the two visitor modals.
 *
 * localStorage first, a first-party cookie when it throws or is missing (Safari
 * private mode and some embedded browsers do both), and an in-memory flag when
 * even that fails so a modal at least cannot repeat inside one session. Every
 * read and write is wrapped: storage is never allowed to break the page.
 */

import type { VisitModalName } from "@/lib/ui/visit-modals";

export const VISIT_MODAL_KEYS: Record<VisitModalName, string> = {
  intro: "khw.modal.intro.v1",
  support: "khw.modal.support.v1",
};

/**
 * Set by `?resetModals=1` so the reload that follows also ignores the server's
 * "this visitor has been here before". Session-scoped: it never leaves the tab.
 */
export const VISIT_MODAL_RESET_KEY = "khw.modal.reset.v1";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The in-memory last resort, and the mirror every successful write also keeps. */
const memory = new Map<string, string>();

/** Reads one cookie's value out of a `document.cookie` string. */
export function readCookieValue(cookie: string, name: string): string | null {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** The `document.cookie` assignment for a first-party, one-year record. */
export function visitModalCookie(name: string, value: string, secure: boolean): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${COOKIE_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ];
  if (secure) attributes.push("secure");
  return attributes.join("; ");
}

/** The assignment that expires a record rather than setting one. */
export function expiredVisitModalCookie(name: string): string {
  return `${name}=; path=/; max-age=0; samesite=lax`;
}

function fromLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function fromCookie(key: string): string | null {
  try {
    return readCookieValue(document.cookie, key);
  } catch {
    return null;
  }
}

/** The moment this modal was first shown to this visitor, or null if never. */
export function readVisitModalRecord(key: string): number | null {
  const stored = fromLocalStorage(key) ?? fromCookie(key) ?? memory.get(key) ?? null;
  if (stored === null) return null;
  const at = Date.parse(stored);
  return Number.isFinite(at) ? at : null;
}

/**
 * Records that this modal has now been shown, as an ISO timestamp. Every layer
 * that accepts it gets it, so a later failure of one still leaves the record.
 */
export function writeVisitModalRecord(key: string, nowMs: number): void {
  const value = new Date(nowMs).toISOString();
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // No localStorage here; the cookie carries it instead.
  }
  try {
    document.cookie = visitModalCookie(key, value, window.location.protocol === "https:");
  } catch {
    // Memory alone, so it cannot repeat within this session.
  }
}

/** Forgets both records everywhere, for `?resetModals=1`. */
export function clearVisitModalRecords(): void {
  for (const key of Object.values(VISIT_MODAL_KEYS)) {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing was stored there to remove.
    }
    try {
      document.cookie = expiredVisitModalCookie(key);
    } catch {
      // Nothing was stored there either.
    }
  }
}

/** Remembers, for this tab only, that the visitor asked to see the modals again. */
export function markVisitModalReset(): void {
  try {
    window.sessionStorage.setItem(VISIT_MODAL_RESET_KEY, "1");
  } catch {
    // Without sessionStorage the reload simply loses the override.
  }
}

/** True when this tab was reloaded by `?resetModals=1`. */
export function readVisitModalReset(): boolean {
  try {
    return window.sessionStorage.getItem(VISIT_MODAL_RESET_KEY) === "1";
  } catch {
    return false;
  }
}
