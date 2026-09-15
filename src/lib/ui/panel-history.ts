/**
 * Overlay panels live in the URL (`?panel=journey`) so a link or a reload opens
 * the same modal, while the scene and the presence session stay mounted. Opening
 * adds one history entry; closing removes it with Back when this page added it,
 * so the browser's own Back button always closes the modal first.
 */

export const PANEL_NAMES = ["journey", "sponsor", "vote", "audience"] as const;
export type PanelName = (typeof PANEL_NAMES)[number];
export type PanelSection = "passport" | null;

export type PanelLocation = { panel: PanelName | null; section: PanelSection };

export function panelFromSearch(search: string): PanelLocation {
  const value = new URLSearchParams(search).get("panel");
  // Passport used to be its own panel; its links now open Journey at that section.
  if (value === "passport") return { panel: "journey", section: "passport" };
  return (PANEL_NAMES as readonly string[]).includes(value ?? "")
    ? { panel: value as PanelName, section: null }
    : { panel: null, section: null };
}

export type HistoryState = Record<string, unknown> | null | undefined;

export type HistoryStep =
  | { method: "push" | "replace"; url: string; state: Record<string, unknown> }
  | { method: "back" };

function withPanel(href: string, panel: PanelName | null): string {
  const url = new URL(href);
  if (panel) url.searchParams.set("panel", panel);
  else url.searchParams.delete("panel");
  return url.toString();
}

export function openPanelStep(href: string, state: HistoryState, panel: PanelName): HistoryStep {
  const current = state ?? {};
  // Switching between modals replaces the entry this page already added.
  if (current.khwPanelPushed === true && panelFromSearch(new URL(href).search).panel) {
    return { method: "replace", url: withPanel(href, panel), state: { ...current, khwPanel: panel } };
  }
  return { method: "push", url: withPanel(href, panel), state: { ...current, khwPanel: panel, khwPanelPushed: true } };
}

export function closePanelStep(href: string, state: HistoryState): HistoryStep {
  const current = state ?? {};
  if (current.khwPanelPushed === true) return { method: "back" };
  // Opened from a shared link: there is no entry of ours to go back over.
  return { method: "replace", url: withPanel(href, null), state: { ...current, khwPanel: null, khwPanelPushed: false } };
}
