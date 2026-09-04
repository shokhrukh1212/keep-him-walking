import { describe, expect, it } from "vitest";
import { dictionaryFor, hasLocale, supportedLocales } from "./index";

describe("locale boundary", () => {
  it("launches English-first and fails safely to the complete English dictionary", () => {
    expect(supportedLocales).toEqual(["en"]);
    expect(hasLocale("en")).toBe(true);
    expect(hasLocale("fr")).toBe(false);
    expect(dictionaryFor("fr").premise).toContain("walks");
  });
});
