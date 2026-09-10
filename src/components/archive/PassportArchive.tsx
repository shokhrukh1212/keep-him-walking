"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";
import { flagEmoji } from "@/lib/countries/flags";
import { stampLabel } from "@/lib/outcomes/stamp";
import type { SeasonDay } from "@/lib/season/data";

type Me = { passport?: { collected?: string[]; streak?: number } };

export function PassportArchive({ days }: { days: SeasonDay[] }) {
  // Which days this visitor collected is private and uncacheable, so it is
  // fetched after paint rather than baked into the page.
  const [mine, setMine] = useState<{ collected: Set<string>; streak: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/me", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Me> : null)
      .then((body) => {
        if (!body?.passport) return;
        setMine({ collected: new Set(body.passport.collected ?? []), streak: Number(body.passport.streak ?? 0) });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    trackVisitorEvent("archive_viewed", { completed_days: days.length });
  }, [days.length]);

  return <>
    <p className="passport-streak" data-testid="passport-streak">
      {mine === null
        ? "Checking which days you were here for…"
        : mine.streak > 0
          ? `${mine.streak} ${mine.streak === 1 ? "day" : "days"} in a row`
          : "No streak yet — watch for thirty seconds to collect today."}
    </p>
    <div className="passport-grid">{days.map((day) => {
      const collected = mine?.collected.has(day.countryDayId) ?? false;
      return <article
        key={day.countryDayId}
        className="passport-card"
        data-stamp={day.stamp ?? "none"}
        data-collected={collected}
        data-testid="passport-card"
      >
        <span>DAY {day.dayNumber}</span>
        <h2>{flagEmoji(day.countryCode)} {day.cityName}</h2>
        <p>{day.countryName}</p>
        <span className="passport-stamp" data-outcome={day.stamp ?? "none"}>{stampLabel(day.stamp)}</span>
        {day.distanceMetres !== null
          ? <small>{(day.distanceMetres / 1_000).toFixed(1)} km confirmed</small>
          : <small>Still walking</small>}
        <small>{collected ? "You were here" : mine === null ? "…" : "You missed this one"}</small>
        {day.storySummary ? <p className="passport-summary">{day.storySummary}</p> : null}
        {day.stamp && day.stamp !== "current"
          ? <Link className="passport-recap-link" href={`/day/${day.dayNumber}`}>Read the day →</Link>
          : null}
      </article>;
    })}</div>
  </>;
}
