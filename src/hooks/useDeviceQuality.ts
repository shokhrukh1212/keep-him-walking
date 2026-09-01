"use client";

import { useEffect, useState } from "react";
import { chooseQualityTier } from "@/lib/world/quality-tier";
import type { QualityTier } from "@/lib/world/types";

export function useDeviceQuality(reducedMotion = false): QualityTier {
  const [tier, setTier] = useState<QualityTier>("medium");

  useEffect(() => {
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    const override = new URLSearchParams(window.location.search).get("quality");
    const update = window.requestAnimationFrame(() => {
      setTier(chooseQualityTier({
        width: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigatorWithMemory.deviceMemory,
        reducedMotion,
        override: override === "low" || override === "medium" || override === "high"
          ? override
          : undefined,
      }));
    });
    return () => window.cancelAnimationFrame(update);
  }, [reducedMotion]);

  return tier;
}
