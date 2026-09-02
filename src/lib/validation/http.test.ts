import { describe, expect, it } from "vitest";
import { readLimitedJson, readLimitedText } from "./http";

describe("bounded request bodies", () => {
  it("retains the exact raw body used for webhook signatures", async () => {
    const raw = '{"event":"paid"}\n';
    await expect(readLimitedText(new Request("https://example.test", { method: "POST", body: raw }), 64)).resolves.toBe(raw);
  });

  it("rejects declared and actual bodies above the endpoint budget", async () => {
    const declared = new Request("https://example.test", { method: "POST", headers: { "content-length": "65" }, body: "{}" });
    await expect(readLimitedText(declared, 64)).rejects.toThrow("BODY_TOO_LARGE");
    const actual = new Request("https://example.test", { method: "POST", body: "x".repeat(65) });
    await expect(readLimitedText(actual, 64)).rejects.toThrow("BODY_TOO_LARGE");
  });

  it("parses JSON only after the byte limit passes", async () => {
    const request = new Request("https://example.test", { method: "POST", body: '{"ok":true}' });
    await expect(readLimitedJson(request, 64)).resolves.toEqual({ ok: true });
  });
});
