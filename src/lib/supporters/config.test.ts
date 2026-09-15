import { describe, expect, it } from "vitest";
import { configuredCoffeeAccessToken, configuredCoffeeUrl } from "./config";

describe("configuredCoffeeUrl", () => {
  it("keeps a real HTTPS profile", () => {
    expect(configuredCoffeeUrl("https://buymeacoffee.com/keepwalking"))
      .toBe("https://buymeacoffee.com/keepwalking");
  });

  it.each([
    undefined,
    "http://buymeacoffee.com/keepwalking",
    "https://example.com/keepwalking",
    "https://buymeacoffee.com/",
    "https://buymeacoffee.com/name/extra",
  ])("fails closed for %s", (value) => {
    expect(configuredCoffeeUrl(value)).toBeNull();
  });
});

describe("configuredCoffeeAccessToken", () => {
  it("does not pass an empty provider credential to the sync", () => {
    expect(configuredCoffeeAccessToken(undefined)).toBeNull();
    expect(configuredCoffeeAccessToken("   ")).toBeNull();
    expect(configuredCoffeeAccessToken(" token ")).toBe("token");
  });
});
