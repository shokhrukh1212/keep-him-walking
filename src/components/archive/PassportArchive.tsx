"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";

export const PASSPORT_KEY = "khw_passport_v1";

export function PassportArchive({ days }: { days: Array<{ id: string; day_number: number; country_name: string; city_name: string; scene_pack_id: string; story_summary: string | null }> }) {
  const rawStamps = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => localStorage.getItem(PASSPORT_KEY) ?? "[]",
    () => "[]",
  );
  const stamps = useMemo(() => {
    try { return JSON.parse(rawStamps) as string[]; } catch { return []; }
  }, [rawStamps]);
  useEffect(() => {
    trackVisitorEvent("archive_viewed", { completed_days: days.length });
  }, [days.length]);
  return <div className="passport-grid">{days.map((day) => (
    <article key={day.id} className="passport-card" data-stamped={stamps.includes(day.scene_pack_id)}>
      <span>DAY {day.day_number}</span><h2>{day.city_name}</h2><p>{day.country_name}</p>
      <small>{stamps.includes(day.scene_pack_id) ? "Collected in this browser" : "Story completed"}</small>
      {day.story_summary ? <p>{day.story_summary}</p> : null}
    </article>
  ))}</div>;
}
