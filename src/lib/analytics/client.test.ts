import { afterEach, describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@vemetric/web", () => ({ vemetric: { trackEvent } }));

import { trackVisitorEvent } from "./client";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VEMETRIC_TOKEN;
  trackEvent.mockReset();
});

describe("visitor analytics failure isolation", () => {
  it("is a no-op when the optional token is absent", () => {
    expect(() => trackVisitorEvent("journey_viewed")).not.toThrow();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not surface a rejected analytics delivery", async () => {
    process.env.NEXT_PUBLIC_VEMETRIC_TOKEN = "preview-test-token";
    trackEvent.mockRejectedValueOnce(new Error("analytics unavailable"));
    expect(() => trackVisitorEvent("scene_ready", { renderer: "pixi" })).not.toThrow();
    await Promise.resolve();
    expect(trackEvent).toHaveBeenCalledOnce();
  });
});
