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
export function useJourneyAudio(walking: boolean, ambientUrl?: string) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const [resumesOnTap, setResumesOnTap] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const footstepTimer = useRef<number | null>(null);
  const ambientRef = useRef(ambientUrl);

  useEffect(() => { ambientRef.current = ambientUrl; }, [ambientUrl]);

  useEffect(() => {
    const read = window.setTimeout(() => setResumesOnTap(savedPreference()), 0);
    return () => window.clearTimeout(read);
  }, []);

  useEffect(() => {
    if (!enabled || !context.current || !walking) {
      if (footstepTimer.current) window.clearInterval(footstepTimer.current);
      footstepTimer.current = null;
      return;
    }
    const audioContext = context.current;
    const step = () => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.setValueAtTime(90, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(52, audioContext.currentTime + 0.08);
      gain.gain.setValueAtTime(0.025, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.11);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
    };
    footstepTimer.current = window.setInterval(step, 760);
    return () => {
      if (footstepTimer.current) window.clearInterval(footstepTimer.current);
      footstepTimer.current = null;
    };
  }, [enabled, walking]);

  useEffect(() => () => {
    if (footstepTimer.current) window.clearInterval(footstepTimer.current);
    void context.current?.close();
    ambience.current?.pause();
  }, []);

  useEffect(() => {
    if (!enabled || !ambientUrl) return;
    const previous = ambience.current;
    const audio = new Audio(publicAssetUrl(ambientUrl));
    audio.loop = true;
    audio.volume = 0.16;
    ambience.current = audio;
    previous?.pause();
    void audio.play().catch(() => setAvailable(false));
    return () => audio.pause();
  }, [ambientUrl, enabled]);

  const start = useCallback(async () => {
    try {
      const audioContext = context.current ?? new AudioContext();
      context.current = audioContext;
      await audioContext.resume();
      const url = ambientRef.current;
      if (url) {
        const audio = new Audio(publicAssetUrl(url));
        audio.loop = true;
        audio.volume = 0.16;
        await audio.play();
        ambience.current?.pause();
        ambience.current = audio;
      }
      setEnabled(true);
      setAvailable(true);
      setResumesOnTap(false);
      savePreference(true);
    } catch {
      setAvailable(false);
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

  return { enabled, available, resumesOnTap, toggle };
}
