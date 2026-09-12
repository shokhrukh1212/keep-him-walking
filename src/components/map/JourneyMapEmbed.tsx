"use client";

import { useEffect, useState } from "react";
import type { JourneyMapData } from "@/lib/map/data";
import { JourneyMap } from "./JourneyMap";

/** Fetched only when shown. An unavailable map says so quietly instead of leaving a gap. */
export function JourneyMapEmbed() {
  const [state, setState] = useState<{ status: "loading" | "ready" | "unavailable"; data: JourneyMapData | null }>(
    { status: "loading", data: null },
  );
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/map", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<JourneyMapData> : null)
      .then((value) => setState(value ? { status: "ready", data: value } : { status: "unavailable", data: null }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "unavailable", data: null });
      });
    return () => controller.abort();
  }, []);
  if (state.status === "ready" && state.data) return <JourneyMap data={state.data} compact />;
  return (
    <p className="map-loading" role="status">
      {state.status === "loading" ? "Loading the route map…" : "The route map is not available right now."}
    </p>
  );
}
