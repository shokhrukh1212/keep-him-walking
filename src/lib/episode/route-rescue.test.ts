import { describe, expect, it } from "vitest";
import {
  FIRST_STOP,
  ROUTE_RESCUE_EPISODE as config,
  newlyCrossed,
  placeReaction,
  rescueTimeline,
  rescueViewAt,
  stampLines,
} from "./route-rescue";

const at = (iso: string) => Date.parse(iso);
const launch = config.actualLaunchAt;
const none = { stamp: null, crossings: [] };
const view = (iso: string, choices = {}, witnesses: Parameters<typeof rescueViewAt>[4] = none, launchAt: string | null = launch) =>
  rescueViewAt(config, at(iso), launchAt, choices, witnesses);

describe("Route rescue episode", () => {
  it("runs only against the 18:00 start, from 17:00:05 until launch", () => {
    expect(view("2026-09-24T17:10:00Z", {}, none, "2026-09-24T17:00:00Z").active).toBe(false);
    expect(view("2026-09-24T17:00:00Z").active).toBe(false);
    expect(view("2026-09-24T17:00:05Z").line?.text).toBe("Right. Postcards away. Real directions out.");
    expect(view("2026-09-24T17:59:59Z").active).toBe(true);
    expect(view("2026-09-24T18:00:00Z").active).toBe(false);
    expect(rescueViewAt(config, at("2026-09-24T17:10:00Z"), launch, {}, none, false).active).toBe(false);
  });

  it("counts down to departure and shows witnesses from 17:06", () => {
    expect(view("2026-09-24T17:59:00Z").departsInMs).toBe(60_000);
    expect(view("2026-09-24T17:05:59Z").witnessesVisible).toBe(false);
    expect(view("2026-09-24T17:06:00Z").witnessesVisible).toBe(true);
  });

  it("opens and closes both polls and lets Camille pick for a quiet visitor", () => {
    expect(view("2026-09-24T17:10:30Z").poll).toMatchObject({ id: "gift", open: true });
    expect(view("2026-09-24T17:12:00Z").line?.text).toBe("Quiet crowd. I'll pick this one.");
    expect(view("2026-09-24T17:12:00Z", { gift: 1 }).line?.text).toContain("water bottle");
    expect(view("2026-09-24T17:34:30Z").poll).toMatchObject({ id: "lastWords", open: true });
    expect(view("2026-09-24T17:36:00Z", { lastWords: 2 }).poll).toMatchObject({ open: false, choice: 2 });
  });

  it("says the chosen last words at 17:59:20 and is silent by 17:59:55", () => {
    expect(view("2026-09-24T17:59:21Z", { lastWords: 1 }).line?.text).toBe("Allez. Go on. I'm watching too.");
    expect(view("2026-09-24T17:59:28Z", { lastWords: 1 }).line?.text).toBe("Thank you, Camille.");
    expect(view("2026-09-24T17:59:28Z").line?.text).toBe("Bonjour.");
    expect(view("2026-09-24T17:59:55Z").line).toBeNull();
    expect(view("2026-09-24T17:59:21Z").finalMoment).toBe(true);
  });

  it("names the real first stop", () => {
    expect(FIRST_STOP.country).toBe("Belgium");
    expect(view("2026-09-24T17:22:00Z").line?.text).toBe("There. That's your first real stop. Belgium.");
  });

  it("branches the stamp ceremony on the real count only", () => {
    expect(stampLines(31, 30)[2].text).toBe("31 witnesses. That's a real departure.");
    expect(stampLines(4, 30)[2].text).toContain("Not quite the tradition");
    expect(stampLines(null, 30)[2].text).toContain("Not quite the tradition");
    expect(view("2026-09-24T17:50:00Z").stampVisible).toBe(true);
  });

  it("never overlaps and keeps every line under 8 s", () => {
    for (const choices of [{}, { gift: 2, lastWords: 2 }]) {
      const lines = rescueTimeline(config, choices, 40);
      for (let i = 1; i < lines.length; i++) expect(lines[i].startSec).toBeGreaterThanOrEqual(lines[i - 1].endSec);
      expect(lines[lines.length - 1].endSec).toBeLessThanOrEqual(3595);
      expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
    }
  });

  it("fires milestones once, never on a first reading, in a gap", () => {
    expect(newlyCrossed(config.milestones, null, 40)).toEqual([]);
    expect(newlyCrossed(config.milestones, 9, 21)).toEqual([10, 20]);
    const timeline = rescueTimeline(config, {}, null);
    const placed = placeReaction(timeline, 20, [{ speaker: "camille", text: "Look." }], "m", 3560);
    expect(placed).toHaveLength(1);
    expect(timeline.every((line) => line.endSec <= placed[0].startSec || line.startSec >= placed[0].endSec)).toBe(true);
  });
});
