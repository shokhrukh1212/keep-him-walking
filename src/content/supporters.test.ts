import { describe, expect, it } from "vitest";
import { supporterPage, type SupporterAcknowledgment } from "./supporters";

describe("supporterPage", () => {
  it("keeps owner-entered acknowledgments chronological and pages back from the latest", () => {
    const entries: SupporterAcknowledgment[] = Array.from({ length: 22 }, (_, index) => ({
      id: String(index + 1), occurredAt: `2034-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`, displayName: `Supporter ${index + 1}`, coffeeCount: null,
    }));
    const latest = supporterPage(entries, null);
    expect(latest.items[0]?.id).toBe("3");
    expect(latest.hasEarlier).toBe(true);
    expect(supporterPage(entries, latest.items[0]!.id).items.map((item) => item.id)).toEqual(["1", "2"]);
  });
});
