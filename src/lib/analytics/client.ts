"use client";

import { vemetric } from "@vemetric/web";

export type VisitorEvent =
  | "journey_viewed"
  | "scene_ready"
  | "watch_session_started"
  | "contribution_milestone"
  | "story_event_viewed"
  | "dialogue_completed"
  | "route_zone_entered"
  | "locomotion_transition"
  | "world_quality_selected"
  | "world_frame_budget"
  | "world_asset_failure"
  | "encounter_sequence_completed";

export function trackVisitorEvent(
  event: VisitorEvent,
  eventData: Record<string, string | number | boolean | null> = {},
): void {
  if (!process.env.NEXT_PUBLIC_VEMETRIC_TOKEN) return;
  void Promise.resolve(vemetric.trackEvent(event, { eventData })).catch(() => undefined);
}
