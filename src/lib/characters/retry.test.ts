import { describe, expect, it } from "vitest";
import { CONTEXT_RESTORE_ATTEMPTS, MAX_STAGE_REBUILDS, characterRetryDelayMs } from "./retry";

describe("characterRetryDelayMs", () => {
  it("tries again quickly, then backs off to a steady poll", () => {
    expect([0, 1, 2, 3, 4].map(characterRetryDelayMs)).toEqual([1_000, 3_000, 8_000, 20_000, 30_000]);
  });

  it("holds the slowest delay however long he has been missing", () => {
    expect([5, 12, 400].map(characterRetryDelayMs)).toEqual([30_000, 30_000, 30_000]);
  });

  it("treats a nonsense attempt as the first one rather than waiting forever", () => {
    expect(characterRetryDelayMs(Number.NaN)).toBe(1_000);
    expect(characterRetryDelayMs(-4)).toBe(1_000);
    expect(characterRetryDelayMs(1.8)).toBe(3_000);
  });

  it("bounds both last resorts, so a device that cannot render him never loops", () => {
    expect(CONTEXT_RESTORE_ATTEMPTS).toBe(3);
    expect(MAX_STAGE_REBUILDS).toBe(3);
  });
});
