"use client";

import { useEffect, useState } from "react";

export function useMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("khw_reduced_motion");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initial = window.setTimeout(
      () => setReducedMotion(stored === null ? media.matches : stored === "true"),
      0,
    );
    const update = () => {
      if (window.localStorage.getItem("khw_reduced_motion") === null) {
        setReducedMotion(media.matches);
      }
    };
    media.addEventListener("change", update);
    return () => {
      window.clearTimeout(initial);
      media.removeEventListener("change", update);
    };
  }, []);

  const toggle = () => {
    setReducedMotion((current) => {
      window.localStorage.setItem("khw_reduced_motion", String(!current));
      return !current;
    });
  };

  return { reducedMotion, toggle };
}
