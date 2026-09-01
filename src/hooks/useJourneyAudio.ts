"use client";

import { useEffect, useRef, useState } from "react";

export function useJourneyAudio(walking: boolean, ambientUrl?: string) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const ambience = useRef<HTMLAudioElement | null>(null);
  const footstepTimer = useRef<number | null>(null);

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
    const audio = new Audio(ambientUrl);
    audio.loop = true;
    audio.volume = 0.16;
    ambience.current = audio;
    previous?.pause();
    void audio.play().catch(() => setAvailable(false));
    return () => audio.pause();
  }, [ambientUrl, enabled]);

  const toggle = async () => {
    if (enabled) {
      ambience.current?.pause();
      setEnabled(false);
      window.localStorage.setItem("khw_sound", "off");
      return;
    }
    try {
      const audioContext = context.current ?? new AudioContext();
      context.current = audioContext;
      await audioContext.resume();
      if (ambientUrl) {
        const audio = new Audio(ambientUrl);
        audio.loop = true;
        audio.volume = 0.16;
        await audio.play();
        ambience.current?.pause();
        ambience.current = audio;
      }
      setEnabled(true);
      setAvailable(true);
      window.localStorage.setItem("khw_sound", "on");
    } catch {
      setAvailable(false);
      setEnabled(false);
    }
  };

  return { enabled, available, toggle };
}
