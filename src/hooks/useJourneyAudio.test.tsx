import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJourneyAudio } from "./useJourneyAudio";

const sources: string[] = [];

class FakeAudio {
  loop = false;
  volume = 1;
  preload = "";
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  onerror: (() => void) | null = null;
  constructor(src: string) { sources.push(src); }
}

afterEach(() => {
  window.localStorage.clear();
  sources.length = 0;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("useJourneyAudio", () => {
  it("always starts muted, even for a visitor who turned sound on before", async () => {
    window.localStorage.setItem("khw_sound", "on");
    vi.stubGlobal("Audio", FakeAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    expect(result.current.enabled).toBe(false);
    await waitFor(() => expect(result.current.resumesOnTap).toBe(true));

    // Their first gesture brings it back; nothing plays before that.
    await act(async () => { window.dispatchEvent(new Event("click")); });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => { await result.current.toggle(); });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem("khw_sound")).toBe("off");
    unmount();
  });

  it("does nothing on a tap when sound was never turned on", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    await act(async () => { window.dispatchEvent(new Event("click")); });
    expect(result.current.enabled).toBe(false);
    expect(result.current.resumesOnTap).toBe(false);

    await act(async () => { await result.current.toggle(); });
    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem("khw_sound")).toBe("on");
    unmount();
  });

  it("keeps the toggle usable when the browser refuses to play without a gesture", async () => {
    class RefusedAudio extends FakeAudio {
      play = vi.fn().mockRejectedValue(new DOMException("gesture required", "NotAllowedError"));
    }
    vi.stubGlobal("Audio", RefusedAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    await act(async () => { await result.current.toggle(); });
    expect(result.current.enabled).toBe(false);
    expect(result.current.available).toBe(true);
    unmount();
  });

  it("marks sound unavailable only when the file cannot be played", async () => {
    class BrokenAudio extends FakeAudio {
      play = vi.fn().mockRejectedValue(new DOMException("no source", "NotSupportedError"));
    }
    vi.stubGlobal("Audio", BrokenAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    await act(async () => { await result.current.toggle(); });
    expect(result.current.available).toBe(false);
    unmount();
  });

  it("retries with a new element after a failed load instead of staying dead", async () => {
    let attempts = 0;
    class FlakyAudio extends FakeAudio {
      play = vi.fn(() => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new DOMException("no source", "NotSupportedError"))
          : Promise.resolve();
      });
    }
    vi.stubGlobal("Audio", FlakyAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    await act(async () => { await result.current.toggle(); });
    expect(result.current.available).toBe(false);
    expect(sources).toHaveLength(1);

    await act(async () => { await result.current.toggle(); });
    expect(result.current.available).toBe(true);
    expect(result.current.enabled).toBe(true);
    expect(sources).toHaveLength(2);
    unmount();
  });

  // public/audio is not deployed; a bare path 404s in production and killed the control.
  it("loads the loop from the asset origin when one is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_ASSET_BASE_URL", "https://assets.keephimwalking.com");
    vi.stubGlobal("Audio", FakeAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio());
    await act(async () => { await result.current.toggle(); });
    expect(sources).toEqual(["https://assets.keephimwalking.com/audio/calm-background.wav"]);
    unmount();
  });
});
