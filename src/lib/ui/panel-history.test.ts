import { describe, expect, it } from "vitest";
import { closePanelStep, openPanelStep, panelFromSearch } from "./panel-history";

const home = "https://keephimwalking.lol/?demo=1";

describe("panel history", () => {
  it("reads the modal from the URL and keeps old passport links working", () => {
    expect(panelFromSearch("?panel=journey")).toEqual({ panel: "journey", section: null });
    expect(panelFromSearch("?panel=passport")).toEqual({ panel: "journey", section: "passport" });
    expect(panelFromSearch("?panel=unknown")).toEqual({ panel: null, section: null });
    expect(panelFromSearch("")).toEqual({ panel: null, section: null });
  });

  it("adds one entry to open and goes back over it to close", () => {
    const open = openPanelStep(home, { next: true }, "journey");
    expect(open).toEqual({
      method: "push",
      url: "https://keephimwalking.lol/?demo=1&panel=journey",
      state: { next: true, khwPanel: "journey", khwPanelPushed: true },
    });
    expect(closePanelStep("https://keephimwalking.lol/?demo=1&panel=journey", open.method === "push" ? open.state : null))
      .toEqual({ method: "back" });
  });

  it("replaces the entry when switching modals", () => {
    expect(openPanelStep(
      "https://keephimwalking.lol/?panel=journey",
      { khwPanel: "journey", khwPanelPushed: true },
      "sponsor",
    )).toEqual({
      method: "replace",
      url: "https://keephimwalking.lol/?panel=sponsor",
      state: { khwPanel: "sponsor", khwPanelPushed: true },
    });
  });

  it("closes a modal opened from a shared link without leaving the page", () => {
    expect(closePanelStep("https://keephimwalking.lol/?panel=vote", null)).toEqual({
      method: "replace",
      url: "https://keephimwalking.lol/",
      state: { khwPanel: null, khwPanelPushed: false },
    });
  });
});
