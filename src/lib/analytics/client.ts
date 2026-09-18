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
  | "encounter_sequence_completed"
  | "postcard_unlocked"
  | "postcard_created"
  | "postcard_shared"
  | "archive_viewed"
  | "country_day_entered"
  | "sponsor_page_viewed"
  | "sponsor_checkout_started"
  | "sponsor_impression"
  | "sponsor_engaged_view"
  | "sponsor_cta_clicked"
  // The two one-time visitor modals (src/hooks/useVisitModals.ts).
  | "intro_modal_shown"
  | "intro_modal_dismissed"
  | "intro_modal_journey_click"
  | "support_modal_shown"
  | "support_modal_sponsor_click"
  | "support_modal_coffee_click"
  | "support_modal_dismissed";

export function trackVisitorEvent(
  event: VisitorEvent,
  eventData: Record<string, string | number | boolean | null> = {},
): void {
  if (!process.env.NEXT_PUBLIC_VEMETRIC_TOKEN) return;
  void Promise.resolve(vemetric.trackEvent(event, { eventData })).catch(() => undefined);
}
