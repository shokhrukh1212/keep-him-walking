"use client";

import { useEffect, useState } from "react";
import { chooseQualityTier } from "@/lib/world/quality-tier";
import type { QualityTier } from "@/lib/world/types";

/**
 * The device's rendering tier, or null until it has been measured once. The world
 * waits for a settled tier so its WebGL application is created once, instead of
 * being built at a guessed tier and torn down a frame later.
 */
export function useDeviceQuality(reducedMotion = false): QualityTier | null {
  const [tier, setTier] = useState<QualityTier | null>(null);

  useEffect(() => {
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    const override = new URLSearchParams(window.location.search).get("quality");
    // Read the OS preference directly: the state passed in settles a tick later, and
    // a second, different tier would rebuild the world.
    const prefersReduced = reducedMotion
      || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const update = window.requestAnimationFrame(() => {
      setTier(chooseQualityTier({
        width: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio || 1,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigatorWithMemory.deviceMemory,
        reducedMotion: prefersReduced,
        override: override === "low" || override === "medium" || override === "high"
          ? override
          : undefined,
      }));
    });
    return () => window.cancelAnimationFrame(update);
  }, [reducedMotion]);

  return tier;
}
