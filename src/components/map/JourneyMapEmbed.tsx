"use client";

import { useEffect, useState } from "react";
import type { JourneyMapData } from "@/lib/map/data";
import { JourneyMap } from "./JourneyMap";

export function JourneyMapEmbed() {
  const [data, setData] = useState<JourneyMapData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/map", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<JourneyMapData> : null)
      .then((value) => { if (value) setData(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return data ? <JourneyMap data={data} compact /> : <p className="map-loading">Journey map unavailable.</p>;
}
