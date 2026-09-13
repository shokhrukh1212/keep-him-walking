import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

describe("clientAddress", () => {
  it("takes the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to the real-ip header, then to one shared unknown key", () => {
    expect(clientAddress(new Headers({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
