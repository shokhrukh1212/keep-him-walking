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
 *
 * A refused play (no user activation yet — iOS Safari does not count
 * pointerdown, for example) is not a broken file: the toggle stays usable and
 * the next tap on it tries again. Only a file the browser cannot load or
 * decode marks sound unavailable.
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

  const element = useCallback(() => {
    if (!ambience.current) {
      const audio = new Audio(BACKGROUND_MUSIC_URL);
      audio.loop = true;
      audio.volume = 0.14;
      audio.preload = "auto";
      audio.addEventListener("error", () => {
        setFailed(true);
        setEnabled(false);
      });
      ambience.current = audio;
    }
    return ambience.current;
  }, []);

  const start = useCallback(async () => {
    // play() must be called synchronously inside the gesture, before any await.
    const audio = element();
    const playing = audio.play();
    try {
      await playing;
      setEnabled(true);
      setFailed(false);
      setResumesOnTap(false);
      savePreference(true);
    } catch (error) {
      setEnabled(false);
      if (error instanceof DOMException && error.name === "NotSupportedError") setFailed(true);
    }
  }, [element]);

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
    // click and touchend grant user activation in every browser; pointerdown does not on iOS.
    // Not once: a refused attempt leaves the listeners in place, and success removes them.
    const events = ["click", "touchend", "keydown"] as const;
    for (const name of events) window.addEventListener(name, resume);
    return () => {
      for (const name of events) window.removeEventListener(name, resume);
    };
  }, [enabled, resumesOnTap, start]);

  const toggle = useCallback(async () => {
    if (enabled) stop();
    else await start();
  }, [enabled, start, stop]);

  return { enabled: enabled && available, available, resumesOnTap, toggle };
}
