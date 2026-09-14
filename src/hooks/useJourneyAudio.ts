"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFERENCE_KEY = "khw_sound";
const BACKGROUND_MUSIC_URL = "/audio/calm-background.wav";

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
 * The calm background loop always starts muted. A visitor who turned it on
 * before gets it back on their first tap or key press, because browsers only
 * play audio after a gesture; nobody hears anything they did not ask for.
 */
export function useJourneyAudio() {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resumesOnTap, setResumesOnTap] = useState(false);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const available = !failed;

  useEffect(() => {
    const read = window.setTimeout(() => setResumesOnTap(savedPreference()), 0);
    return () => window.clearTimeout(read);
  }, []);

  useEffect(() => () => {
    ambience.current?.pause();
  }, []);

  const start = useCallback(async () => {
    try {
      const audio = new Audio(BACKGROUND_MUSIC_URL);
      audio.loop = true;
      audio.volume = 0.14;
      await audio.play();
      ambience.current?.pause();
      ambience.current = audio;
      setEnabled(true);
      setFailed(false);
      setResumesOnTap(false);
      savePreference(true);
    } catch {
      setFailed(true);
      setEnabled(false);
    }
  }, []);

  const stop = useCallback(() => {
    ambience.current?.pause();
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
