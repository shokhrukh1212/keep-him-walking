import { describe, expect, it } from "vitest";
import {
  EPISODE_SCENES,
  PARIS_READINESS_EPISODE as config,
  episodeTimeline,
  episodeViewAt,
  lineSeconds,
} from "./paris-readiness";

const at = (iso: string) => Date.parse(iso);
const launch = config.actualLaunchAt;
const view = (iso: string, choices = {}, launchAt: string | null = launch) => episodeViewAt(config, at(iso), launchAt, choices);

describe("Paris readiness episode", () => {
  it("runs with the announced 17:00 start, and is off without a start or with one inside the hour", () => {
    expect(view("2026-09-24T16:10:00Z", {}, "2026-09-24T17:00:00Z").phase).toBe("live");
    expect(view("2026-09-24T17:00:00Z", {}, "2026-09-24T17:00:00Z").phase).toBe("off");
    expect(view("2026-09-24T16:10:00Z", {}, "2026-09-24T16:30:00Z").phase).toBe("off");
    expect(view("2026-09-24T16:10:00Z", {}, null).phase).toBe("off");
    expect(episodeViewAt(config, at("2026-09-24T16:10:00Z"), launch, {}, false).phase).toBe("off");
  });

  it("walks the UTC boundaries", () => {
    expect(view("2026-09-24T15:59:59Z").phase).toBe("before");
    expect(view("2026-09-24T16:00:00Z").phase).toBe("live");
    expect(view("2026-09-24T16:00:00Z").line?.speaker).toBe("camille");
    expect(view("2026-09-24T16:49:59Z").phase).toBe("live");
    expect(view("2026-09-24T16:50:00Z")).toMatchObject({ phase: "reveal", helpVisible: true });
    expect(view("2026-09-24T16:59:55Z").line?.id).toMatch(/^closing-/);
    const ended = view("2026-09-24T17:00:00Z");
    expect(ended).toMatchObject({ phase: "ended", line: null, poll: null, helpVisible: false });
    expect(view("2026-09-24T18:00:00Z").phase).toBe("off");
  });

  it("counts down to the episode end, never the departure", () => {
    expect(view("2026-09-24T16:59:00Z").episodeEndsInMs).toBe(60_000);
  });

  it("keeps the postcards out of chapter names before 16:45", () => {
    for (const scene of EPISODE_SCENES.filter((s) => s.atSec < 45 * 60)) {
      expect(scene.title.toLowerCase()).not.toContain("postcard");
      for (const line of scene.lines) expect(line.text.toLowerCase()).not.toContain("postcard");
    }
  });

  it("never overlaps speakers, never runs past 17:00 and keeps lines 5–8 s", () => {
    for (const choices of [{}, { intro: 2, pose: 1, helpedAtMs: at("2026-09-24T16:51:00Z") }]) {
      const lines = episodeTimeline(config, choices);
      for (let i = 1; i < lines.length; i++) expect(lines[i].startSec).toBeGreaterThanOrEqual(lines[i - 1].endSec);
      expect(lines[lines.length - 1].endSec).toBeLessThanOrEqual(3600);
      expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
      for (const line of lines) expect(line.endSec - line.startSec).toBeLessThanOrEqual(8);
    }
    expect(lineSeconds("Good.")).toBe(5);
  });

  it("opens and closes polls on time and lets Camille pick for a quiet visitor", () => {
    expect(view("2026-09-24T16:06:30Z").poll).toMatchObject({ id: "intro", open: true, choice: null });
    expect(view("2026-09-24T16:08:00Z").poll).toMatchObject({ id: "intro", open: false });
    expect(view("2026-09-24T16:08:00Z").line?.text).toBe("Quiet crowd. I'll pick this one.");
    expect(view("2026-09-24T16:08:00Z", { intro: 1 }).line?.text).toContain("The internet named me");
    expect(view("2026-09-24T16:26:00Z", { pose: 2 }).line?.text).toContain("angle");
    expect(view("2026-09-24T16:26:00Z", { pose: 2 }).poll).toMatchObject({ id: "pose", choice: 2 });
  });

  it("thanks a helper once and drops the no-help line", () => {
    const helpedAtMs = at("2026-09-24T16:51:00Z");
    expect(view("2026-09-24T16:51:02Z", { helpedAtMs }).line?.id).toBe("help-thanks");
    expect(episodeTimeline(config, { helpedAtMs }).some((line) => line.id.startsWith("no-help"))).toBe(false);
    expect(episodeTimeline(config, {}).some((line) => line.id.startsWith("no-help"))).toBe(true);
  });

  it("lands a late arrival on the current line, not the beginning", () => {
    expect(view("2026-09-24T16:45:00Z").line?.text).toBe("These are fourteen postcards.");
    expect(view("2026-09-24T16:45:00Z").chapter).toBe("A discovery");
  });
});
