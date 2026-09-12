import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tashkentCountryPackV4 } from "@/content/countries/tashkent.v4";
import { CLIP_DURATIONS } from "@/lib/characters/manifest";
import { countryPackV3Schema } from "@/lib/content/schema";
import {
  ACTION_CLIPS,
  CROWD_ACTION_DURATION_SECONDS,
  OWN_ACTION_KINDS,
  STOP_ENTRY_SECONDS,
  actionDurationSeconds,
  activityLabel,
  activityWindow,
  conversationDurationSeconds,
  conversationResident,
  conversationScripts,
  conversationSegments,
  conversationSpeakerName,
} from "./activities";

describe("activity catalogue", () => {
  it("plays every take whole: a stop entry plus the recorded length, never squeezed", () => {
    for (const [kind, clip] of Object.entries(ACTION_CLIPS)) {
      expect(actionDurationSeconds(kind as keyof typeof ACTION_CLIPS))
        .toBeCloseTo(STOP_ENTRY_SECONDS + CLIP_DURATIONS[clip], 3);
    }
    expect(actionDurationSeconds("phone")).toBe(24.77);
    expect(CROWD_ACTION_DURATION_SECONDS).toEqual({ wave: 5.93, drink: 10.07, photo: 5.2 });
  });

  it("matches the crowd windows the database schedules", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase/migrations/202609120036_journey_activities.sql"),
      "utf8",
    );
    for (const [kind, seconds] of Object.entries(CROWD_ACTION_DURATION_SECONDS)) {
      expect(migration).toContain(`when '${kind}' then ${seconds.toFixed(3)}`);
    }
  });

  it("keeps the autonomous cadence to the requested drink and photo actions", () => {
    expect([...OWN_ACTION_KINDS].sort()).toEqual(["drink", "photo"]);
  });

  it("builds natural-length conversation choreography", () => {
    expect(conversationSegments([]).map((segment) => segment.phase)).toEqual(["notice", "stop", "greet"]);
    expect(conversationDurationSeconds([])).toBe(6.93);
    const lines = [
      { speaker: "npc" as const, text: "Bonjour!", mood: "curious" as const },
      { speaker: "traveler" as const, text: "Bonjour.", mood: "amused" as const, durationMs: 3_000 },
    ];
    expect(conversationSegments(lines)).toEqual([
      { phase: "notice", start: 0, duration: 1 },
      { phase: "stop", start: 1, duration: 1.2 },
      { phase: "greet", start: 2.2, duration: 4.73 },
      { phase: "listen", start: 6.93, duration: 4.5, lineIndex: 0 },
      { phase: "talk", start: 11.43, duration: 3, lineIndex: 1 },
      { phase: "goodbye", start: 14.43, duration: 4.73 },
    ]);
    expect(conversationDurationSeconds(lines)).toBe(19.16);
  });

  it("offers a pack's single encounter as its story until it carries a rotation", () => {
    const [story] = conversationScripts(tashkentCountryPackV4);
    expect(story).toMatchObject({ role: "story", placeTags: [] });
    expect(story!.lines).toEqual(tashkentCountryPackV4.encounters[0]!.lines);
    const withRotation = countryPackV3Schema.parse({
      ...tashkentCountryPackV4,
      conversations: [{
        id: "tea-house", residentType: "resident-a", speakerName: "Dilnoza", placeTags: ["cafe"],
        lines: [{ speaker: "npc", text: "The tea is fresh.", mood: "neutral" }],
      }],
    });
    expect(conversationScripts(withRotation)).toEqual([]);
    const approvedRotation = countryPackV3Schema.parse({
      ...withRotation,
      conversations: withRotation.conversations.map((script) => ({ ...script, review: "creator_reviewed" })),
    });
    const [script] = conversationScripts(approvedRotation);
    expect(script).toMatchObject({ id: "tea-house", role: "ambient", review: "creator_reviewed" });
    expect(conversationResident(approvedRotation, script!)).toBe("resident-a");
    expect(conversationSpeakerName(approvedRotation, script!)).toBe("Dilnoza");
    expect(conversationResident(approvedRotation, null)).toBe(approvedRotation.npcSystem.baseType);
  });

  it("names every state the status line can show", () => {
    expect(activityLabel("wave", "crowd")).toBe("Waving back");
    expect(activityLabel("wave", "beat")).toBe("Waving hello");
    expect(activityLabel("conversation", "system", "Camille")).toBe("Talking with Camille");
    expect(activityLabel("greeting", "system")).toBe("Saying hello");
    expect(activityLabel("lean", "system")).toBe("Taking a breather");
    expect(activityLabel("tie_shoe", "system")).toBe("Tying a shoe");
  });

  it("reads only live, well-formed windows", () => {
    expect(activityWindow({ kind: "phone", atActiveSecond: 10, endsAtActiveSecond: 20 })).toEqual([10, 20]);
    expect(activityWindow({ kind: "phone", atActiveSecond: 10, endsAtActiveSecond: 20, cancelled: true })).toBeNull();
    expect(activityWindow({ kind: "wave", atActiveSecond: 10 })).toEqual([10, 15.93]);
    expect(activityWindow({ kind: "phone", atActiveSecond: 10 })).toBeNull();
    expect(activityWindow({ kind: "phone", atActiveSecond: 10, endsAtActiveSecond: 9 })).toBeNull();
    expect(activityWindow({ kind: "phone", atActiveSecond: Number.NaN, endsAtActiveSecond: 9 })).toBeNull();
  });
});
