"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicAssetUrl } from "@/lib/assets/url";

const PREFERENCE_KEY = "khw_sound";
const BACKGROUND_MUSIC_PATH = "/audio/calm-background.wav";

/**
 * Where the loop may be fetched from, in order. `public/audio` is excluded from the
 * deployment and mirrored on the asset origin, but this one file is un-ignored so the
 * same-origin copy always exists: the control must not die because the asset origin is
 * unreachable, blocked by an extension or serving a stale 404. The origin copy is the
 * second chance, and a dev build where both resolve the same way keeps only one.
 */
function musicSources(): string[] {
  const mirrored = publicAssetUrl(BACKGROUND_MUSIC_PATH);
  return mirrored === BACKGROUND_MUSIC_PATH ? [BACKGROUND_MUSIC_PATH] : [BACKGROUND_MUSIC_PATH, mirrored];
}

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
 * the next tap on it tries again. A file the browser could not load or decode
 * is retried immediately from the other source, and only when every source has
 * failed is sound reported unavailable — never permanently, because the next
 * press throws the element away and fetches again.
 */
export function useJourneyAudio() {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resumesOnTap, setResumesOnTap] = useState(false);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const sources = useMemo(() => musicSources(), []);
  const source = useRef(0);
  const available = !failed;

  useEffect(() => {
    const read = window.setTimeout(() => setResumesOnTap(savedPreference()), 0);
    return () => window.clearTimeout(read);
  }, []);

  useEffect(() => () => {
    ambience.current?.pause();
  }, []);

  const element = useCallback((fresh: boolean) => {
    if (fresh && ambience.current) {
      // Silence the discarded element: a late error from it must not contradict
      // the state of the one now playing.
      ambience.current.onerror = null;
      ambience.current.pause();
      ambience.current = null;
    }
    if (!ambience.current) {
      const audio = new Audio(sources[source.current % sources.length]);
      audio.loop = true;
      audio.volume = 0.14;
      audio.preload = "auto";
      audio.onerror = () => {
        // Whatever failed, the next attempt starts from the other source.
        source.current += 1;
        setFailed(true);
        setEnabled(false);
      };
      ambience.current = audio;
    }
    return ambience.current;
  }, [sources]);

  const started = useCallback(() => {
    setEnabled(true);
    setFailed(false);
    setResumesOnTap(false);
    savePreference(true);
  }, []);

  const start = useCallback(async () => {
    // play() must be called synchronously inside the gesture, before any await.
    // A previous failure gets a new element so the browser refetches the file.
    const audio = element(failed);
    setFailed(false);
    const playing = audio.play();
    try {
      await playing;
      started();
      return;
    } catch (error) {
      setEnabled(false);
      // A refused play is only a missing gesture; the toggle tries again on the next press.
      if (!(error instanceof DOMException) || error.name !== "NotSupportedError") return;
    }
    // This source cannot be fetched or decoded. The gesture is still recent, so the
    // other source gets its chance now rather than costing the visitor a second press.
    source.current += 1;
    if (sources.length > 1) {
      try {
        await element(true).play();
        started();
        return;
      } catch {
        // Both sources refused; fall through to the honest unavailable state.
      }
    }
    setFailed(true);
  }, [element, failed, sources.length, started]);

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
