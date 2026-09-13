import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useJourneyAudio } from "./useJourneyAudio";

class FakeAudio {
  loop = false;
  volume = 1;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("useJourneyAudio", () => {
  it("always starts muted, even for a visitor who turned sound on before", async () => {
    window.localStorage.setItem("khw_sound", "on");
    vi.stubGlobal("Audio", FakeAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio("/paris.mp3"));
    expect(result.current.enabled).toBe(false);
    await waitFor(() => expect(result.current.resumesOnTap).toBe(true));

    // Their first gesture brings it back; nothing plays before that.
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => { await result.current.toggle(); });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem("khw_sound")).toBe("off");
    unmount();
  });

  it("does nothing on a tap when sound was never turned on", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    const { result, unmount } = renderHook(() => useJourneyAudio("/paris.mp3"));
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); });
    expect(result.current.enabled).toBe(false);
    expect(result.current.resumesOnTap).toBe(false);

    await act(async () => { await result.current.toggle(); });
    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem("khw_sound")).toBe("on");
    unmount();
  });
});
