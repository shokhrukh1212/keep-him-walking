"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PRELAUNCH_MONOLOGUES, arrangePrelaunchMonologues } from "@/content/prelaunch/monologues";
import { PreviewMonologueController } from "@/lib/preview/controller";
import { seasonSponsorshipOpen } from "@/lib/preview/sponsor-availability";

type Options = {
  /** The server declared the intentional prelaunch and this page has its answer. */
  active: boolean;
  cityName: string;
  seasonNumber: number;
  lifecycleState?: "waiting" | "scheduled";
  filledRegular?: number | null;
  sponsorsEnabled?: boolean;
  /** The traveler is ready, or this page will show no model at all. */
  modelReady: boolean;
  /** A modal is open or the journey could not be read: no new monologue starts. */
  deferred: boolean;
  reducedMotion: boolean;
  /** Server-synchronized wall-clock milliseconds. */
  wallClockMs: number;
};

/**
 * The page's one monologue controller. It lives as long as the page, so opening a modal,
 * resizing or re-rendering never restarts the schedule; React hears from it only when the
 * caption actually changes.
 */
export function usePreviewMonologue({ active, cityName, seasonNumber, lifecycleState, filledRegular, sponsorsEnabled = true, modelReady, deferred, reducedMotion, wallClockMs }: Options) {
  const [controller] = useState(() => new PreviewMonologueController({
    lines: (() => {
      const key = "khw_prelaunch_openers_v1";
      let recent: string[] = [];
      try {
        if (typeof window !== "undefined") recent = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      } catch { /* private storage can be unavailable */ }
      const arranged = arrangePrelaunchMonologues(PRELAUNCH_MONOLOGUES, recent);
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify([arranged[0]?.id, ...recent].filter(Boolean).slice(0, 3)));
      } catch { /* nonessential preference */ }
      return arranged;
    })(),
    loadSponsorOpen: (season) => sponsorsEnabled ? seasonSponsorshipOpen(season) : Promise.resolve(false),
  }));
  useEffect(() => {
    controller.setWallClock(wallClockMs);
  }, [controller, wallClockMs]);
  useEffect(() => {
    controller.configure({ cityName, seasonNumber, lifecycleState, filledRegular });
  }, [controller, cityName, seasonNumber, lifecycleState, filledRegular]);
  useEffect(() => {
    controller.setReducedMotion(reducedMotion);
  }, [controller, reducedMotion]);
  useEffect(() => {
    controller.setDeferred(deferred);
  }, [controller, deferred]);
  useEffect(() => {
    if (!active) return;
    controller.start();
    // Leaving the preview (a live season began, or the page closed) ends it at once.
    return () => controller.stop();
  }, [active, controller]);
  useEffect(() => {
    if (active && modelReady) controller.setModelReady();
  }, [active, controller, modelReady]);
  const caption = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  return { controller, caption };
}
