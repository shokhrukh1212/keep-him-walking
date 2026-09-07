"use client";

import { useEffect, useState } from "react";

export function useMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Retire the old manual mode. A stale local value must never leave the
    // traveler frozen while the HUD says he is walking.
    window.localStorage.removeItem("khw_reduced_motion");
    const initial = window.setTimeout(() => setReducedMotion(media.matches), 0);
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => {
      window.clearTimeout(initial);
      media.removeEventListener("change", update);
    };
  }, []);

  return reducedMotion;
}
