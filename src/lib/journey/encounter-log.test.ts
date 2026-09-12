import { describe, expect, it } from "vitest";
import { parisCountryPackV2 } from "@/content/countries/paris.v2";
import type { ScheduledActionView } from "@/lib/contracts";
import { ENCOUNTER_LOG_LIMIT, mergeEncounterLog, playedEncounters } from "./encounter-log";

function row(atActiveSecond: number, variant: string, extra: Partial<ScheduledActionView> = {}): ScheduledActionView {
  return {
    kind: "conversation",
    atActiveSecond,
    endsAtActiveSecond: atActiveSecond + 30,
    variant,
    occurrenceKey: `conversation:${atActiveSecond}`,
    source: "system",
    ...extra,
  };
}

describe("playedEncounters", () => {
  it("lists begun, uncancelled conversations newest first, with speaker and place", () => {
    const rows = [
      row(150, "paris-station-hello"),
      row(600, "paris-canal-advice"),
      row(640, "paris-cafe-minute", { cancelled: true }),
      row(900, "paris-market-peaches"),
      { kind: "greeting", atActiveSecond: 300, endsAtActiveSecond: 311, occurrenceKey: "greeting:300", source: "system" },
    ] satisfies ScheduledActionView[];
    const played = playedEncounters(parisCountryPackV2, rows, 700);
    expect(played.map((entry) => entry.scriptId)).toEqual(["paris-canal-advice", "paris-station-hello"]);
    // 600 raw seconds less 41 held seconds is 559 walking seconds: the second place.
    expect(played[0]).toMatchObject({ speakerName: "Camille", placeLabel: "Canal Saint-Martin" });
    expect(played[1]).toMatchObject({ placeLabel: "Gare du Nord" });
    expect(played[0]!.lines.length).toBeGreaterThan(0);
  });

  it("ignores a script the pinned pack does not know", () => {
    expect(playedEncounters(parisCountryPackV2, [row(10, "not-a-script")], 100)).toEqual([]);
  });
});

describe("mergeEncounterLog", () => {
  it("keeps the newest few and returns the same log when nothing is new", () => {
    const first = playedEncounters(parisCountryPackV2, [row(150, "paris-station-hello")], 200);
    const log = mergeEncounterLog([], first);
    expect(mergeEncounterLog(log, first)).toBe(log);

    const later = playedEncounters(parisCountryPackV2, [
      row(500, "paris-canal-advice"),
      row(900, "paris-market-peaches"),
      row(1_300, "paris-cafe-minute"),
    ], 1_400);
    const merged = mergeEncounterLog(log, later);
    expect(merged).toHaveLength(ENCOUNTER_LOG_LIMIT);
    expect(merged.map((entry) => entry.scriptId)).toEqual(["paris-cafe-minute", "paris-market-peaches", "paris-canal-advice"]);
  });
});
