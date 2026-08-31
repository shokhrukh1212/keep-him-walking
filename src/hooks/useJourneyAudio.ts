"use client";

import { useEffect, useRef, useState } from "react";

export function useJourneyAudio(walking: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const ambience = useRef<GainNode | null>(null);
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
  }, []);

  const toggle = async () => {
    if (enabled) {
      ambience.current?.gain.setTargetAtTime(0, context.current?.currentTime ?? 0, 0.08);
      setEnabled(false);
      window.localStorage.setItem("khw_sound", "off");
      return;
    }
    try {
      const audioContext = context.current ?? new AudioContext();
      context.current = audioContext;
      await audioContext.resume();
      if (!ambience.current) {
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let index = 0; index < data.length; index += 1) {
          last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
          data[index] = last;
        }
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        source.buffer = buffer;
        source.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 560;
        gain.gain.value = 0.09;
        source.connect(filter).connect(gain).connect(audioContext.destination);
        source.start();
        ambience.current = gain;
      } else {
        ambience.current.gain.setTargetAtTime(0.09, audioContext.currentTime, 0.08);
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
