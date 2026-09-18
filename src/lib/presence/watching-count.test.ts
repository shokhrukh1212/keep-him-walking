import { describe, expect, it } from "vitest";
import { peopleWatching } from "./watching-count";

describe("peopleWatching", () => {
  it("takes DataFast's larger count of everyone with the site open", () => {
    expect(peopleWatching(2, 9)).toBe(9);
  });

  it("never reports fewer than the watchers the server confirmed", () => {
    // The bug on 18 September: DataFast answered 0 while three leases were live
    // and he was walking, so the header denied the rule the walk was following.
    expect(peopleWatching(3, 0)).toBe(3);
  });

  it("answers from the confirmed watchers before DataFast has replied", () => {
    expect(peopleWatching(2, undefined)).toBe(2);
  });

  it("answers from the confirmed watchers when DataFast could not be read", () => {
    expect(peopleWatching(2, null)).toBe(2);
  });

  it("answers from DataFast alone when presence is unknown", () => {
    expect(peopleWatching(null, 5)).toBe(5);
  });

  it("reports an empty audience as zero, not as unknown", () => {
    expect(peopleWatching(0, 0)).toBe(0);
  });

  it("knows nothing when neither source has answered", () => {
    expect(peopleWatching(null, undefined)).toBeNull();
    expect(peopleWatching(undefined, null)).toBeNull();
  });

  it("refuses a value that is not a whole count", () => {
    expect(peopleWatching(Number.NaN, 4)).toBe(4);
    expect(peopleWatching(-1, 4)).toBe(4);
    expect(peopleWatching(1.5, null)).toBeNull();
  });
});
