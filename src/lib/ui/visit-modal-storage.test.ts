import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISIT_MODAL_KEYS,
  clearVisitModalRecords,
  expiredVisitModalCookie,
  readCookieValue,
  readVisitModalRecord,
  visitModalCookie,
  writeVisitModalRecord,
} from "@/lib/ui/visit-modal-storage";

const NOW = Date.parse("2026-09-18T09:00:00.000Z");

/** Replaces window.localStorage for one test. */
function useStorage(storage: Partial<Storage> | null) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

const realLocalStorage = window.localStorage;

beforeEach(() => {
  useStorage(realLocalStorage);
  window.localStorage.clear();
  clearVisitModalRecords();
});

afterEach(() => {
  useStorage(realLocalStorage);
  vi.restoreAllMocks();
});

describe("readCookieValue", () => {
  it("finds one record among others and decodes it", () => {
    const cookie = `other=1; ${VISIT_MODAL_KEYS.intro}=${encodeURIComponent("2026-09-18T09:00:00.000Z")}; last=2`;
    expect(readCookieValue(cookie, VISIT_MODAL_KEYS.intro)).toBe("2026-09-18T09:00:00.000Z");
    expect(readCookieValue(cookie, VISIT_MODAL_KEYS.support)).toBeNull();
    expect(readCookieValue("", VISIT_MODAL_KEYS.intro)).toBeNull();
  });

  it("does not match a name that merely ends with the key", () => {
    expect(readCookieValue(`not.${VISIT_MODAL_KEYS.intro}=x`, VISIT_MODAL_KEYS.intro)).toBeNull();
  });
});

describe("visitModalCookie", () => {
  it("writes a first-party record that lasts a year", () => {
    const assignment = visitModalCookie(VISIT_MODAL_KEYS.support, "2026-09-18T09:00:00.000Z", true);
    expect(assignment).toContain("path=/");
    expect(assignment).toContain(`max-age=${60 * 60 * 24 * 365}`);
    expect(assignment).toContain("samesite=lax");
    expect(assignment).toContain("secure");
    expect(visitModalCookie(VISIT_MODAL_KEYS.support, "x", false)).not.toContain("secure");
  });

  it("expires a record rather than setting one", () => {
    expect(expiredVisitModalCookie(VISIT_MODAL_KEYS.intro)).toContain("max-age=0");
  });
});

describe("the record itself", () => {
  it("round-trips an ISO timestamp through localStorage", () => {
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.intro)).toBeNull();
    writeVisitModalRecord(VISIT_MODAL_KEYS.intro, NOW);
    expect(window.localStorage.getItem(VISIT_MODAL_KEYS.intro)).toBe("2026-09-18T09:00:00.000Z");
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.intro)).toBe(NOW);
  });

  it("treats a value that is not a date as no record at all", () => {
    window.localStorage.setItem(VISIT_MODAL_KEYS.intro, "yes");
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.intro)).toBeNull();
  });

  it("falls back to a cookie when localStorage throws, as Safari private mode does", () => {
    useStorage({
      getItem: () => { throw new DOMException("QuotaExceededError"); },
      setItem: () => { throw new DOMException("QuotaExceededError"); },
      removeItem: () => { throw new DOMException("QuotaExceededError"); },
    });
    writeVisitModalRecord(VISIT_MODAL_KEYS.support, NOW);
    expect(document.cookie).toContain(VISIT_MODAL_KEYS.support);
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.support)).toBe(NOW);
    document.cookie = expiredVisitModalCookie(VISIT_MODAL_KEYS.support);
  });

  it("keeps an in-memory flag when neither store is writable", () => {
    useStorage({
      getItem: () => { throw new DOMException("SecurityError"); },
      setItem: () => { throw new DOMException("SecurityError"); },
      removeItem: () => { throw new DOMException("SecurityError"); },
    });
    const cookie = vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    writeVisitModalRecord(VISIT_MODAL_KEYS.intro, NOW);
    expect(cookie).toHaveBeenCalled();
    // Nothing survives the page, but nothing repeats inside this session either.
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.intro)).toBe(NOW);
  });

  it("forgets both records, for the reset helper", () => {
    writeVisitModalRecord(VISIT_MODAL_KEYS.intro, NOW);
    writeVisitModalRecord(VISIT_MODAL_KEYS.support, NOW);
    clearVisitModalRecords();
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.intro)).toBeNull();
    expect(readVisitModalRecord(VISIT_MODAL_KEYS.support)).toBeNull();
  });
});
