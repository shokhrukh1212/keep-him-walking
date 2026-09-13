"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";

const PREFERENCE_KEY = "khw_sound";

function savedPreference(): boolean {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY) === "on";
  } catch {
    return false;
  }
}

function savePreference(on: boolean) {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, on ? "on" : "off");
  } catch {
    // A blocked store only means the choice is not remembered next time.
  }
}

/**
 * Sound always starts muted. A visitor who turned it on before gets it back on
 * their first tap or key press, because browsers only play audio after a gesture;
 * nobody hears anything they did not ask for.
 */
export function useJourneyAudio(ambientUrl?: string) {
  const [enabled, setEnabled] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [resumesOnTap, setResumesOnTap] = useState(false);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const playingUrl = useRef<string | undefined>(undefined);
  const ambientRef = useRef(ambientUrl);
  const available = Boolean(ambientUrl) && failedUrl !== ambientUrl;

  useEffect(() => { ambientRef.current = ambientUrl; }, [ambientUrl]);

  useEffect(() => {
    const read = window.setTimeout(() => setResumesOnTap(savedPreference()), 0);
    return () => window.clearTimeout(read);
  }, []);

  useEffect(() => () => {
    ambience.current?.pause();
  }, []);

  useEffect(() => {
    if (!ambientUrl) {
      ambience.current?.pause();
      playingUrl.current = undefined;
      return;
    }
    if (!enabled || playingUrl.current === ambientUrl) return;
    const previous = ambience.current;
    const audio = new Audio(publicAssetUrl(ambientUrl));
    audio.loop = true;
    audio.volume = 0.16;
    ambience.current = audio;
    playingUrl.current = ambientUrl;
    previous?.pause();
    void audio.play().catch(() => setFailedUrl(ambientUrl));
    return () => audio.pause();
  }, [ambientUrl, enabled]);

  const start = useCallback(async () => {
    try {
      const url = ambientRef.current;
      if (!url) throw new Error("No ambient audio for this place");
      const audio = new Audio(publicAssetUrl(url));
      audio.loop = true;
      audio.volume = 0.16;
      await audio.play();
      ambience.current?.pause();
      ambience.current = audio;
      playingUrl.current = url;
      setEnabled(true);
      setFailedUrl(null);
      setResumesOnTap(false);
      savePreference(true);
    } catch {
      setFailedUrl(ambientRef.current ?? null);
      setEnabled(false);
    }
  }, []);

  const stop = useCallback(() => {
    ambience.current?.pause();
    playingUrl.current = undefined;
    setEnabled(false);
    setResumesOnTap(false);
    savePreference(false);
  }, []);

  useEffect(() => {
    if (!resumesOnTap || enabled) return;
    const resume = (event: Event) => {
      // The toggle itself decides on its own click.
      if (event.target instanceof Element && event.target.closest(".sound-toggle")) return;
      void start();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [enabled, resumesOnTap, start]);

  const toggle = useCallback(async () => {
    if (enabled) stop();
    else await start();
  }, [enabled, start, stop]);

  return { enabled: enabled && available, available, resumesOnTap, toggle };
}
