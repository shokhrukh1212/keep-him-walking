"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";
import {
  IDLE_WATCH_CLOCK,
  VISIT_MODAL_TICK_MS,
  hasSponsorReferral,
  nextVisitModal,
  visitModalsSettled,
  watchClockActiveMs,
  watchClockAt,
  type VisitModalDismissMethod,
  type VisitModalName,
  type VisitModalState,
  type WatchClock,
} from "@/lib/ui/visit-modals";
import {
  VISIT_MODAL_KEYS,
  clearVisitModalRecords,
  markVisitModalReset,
  readVisitModalRecord,
  readVisitModalReset,
  writeVisitModalRecord,
} from "@/lib/ui/visit-modal-storage";

/** The page facts the queue needs. All of them are already known to the journey. */
export type VisitModalInputs = {
  /** The scene has reported a renderer: something is on screen to introduce. */
  sceneReady: boolean;
  /** A panel, the sponsor flow, a toast, loading or an error is in the way. */
  blocked: boolean;
  /** The journey is really live, so "you kept him walking" is true. */
  supportEligible: boolean;
  /** The server's visitor cookie says this is a return visit; null while unknown. */
  returningVisitor: boolean | null;
};

export type VisitModalsController = {
  /** The one modal on screen, or null. */
  open: VisitModalName | null;
  /** Closes it and reports how. */
  dismiss: (method: VisitModalDismissMethod) => void;
  /** Closes it because the visitor is being sent somewhere the modal named. */
  follow: (event: "intro_modal_journey_click" | "support_modal_sponsor_click" | "support_modal_coffee_click") => void;
};

type Session = {
  introShownAtMs: number | null;
  supportShownAtMs: number | null;
  introClosedAtMs: number | null;
  sceneReadyAtMs: number | null;
  unblockedAtMs: number | null;
  blockedNow: boolean;
  sponsorReferral: boolean;
  resetOverride: boolean;
  clock: WatchClock;
  openModal: VisitModalName | null;
};

const INITIAL_SESSION: Session = {
  introShownAtMs: null,
  supportShownAtMs: null,
  introClosedAtMs: null,
  sceneReadyAtMs: null,
  unblockedAtMs: null,
  blockedNow: false,
  sponsorReferral: false,
  resetOverride: false,
  clock: IDLE_WATCH_CLOCK,
  openModal: null,
};

const RESET_PARAM = "resetModals";

/** Visible tab plus a focused window: the only time watching is counted. */
function activelyWatching(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Clears both records and reloads without the parameter that asked for it. */
function resetAndReload(): void {
  clearVisitModalRecords();
  markVisitModalReset();
  const url = new URL(window.location.href);
  url.searchParams.delete(RESET_PARAM);
  window.location.replace(url.toString());
}

/**
 * Queues the first-visit introduction and the sustained-watching support ask.
 *
 * Nothing here touches the scene: the modals are portalled over it, the presence
 * heartbeat and the animation loop are not consulted and not paused, and an open
 * modal still counts as watching, because it still counts as having the page open.
 *
 * Only `open` is React state, so a visitor who sees neither modal never causes a
 * render from this hook; the timing itself lives in a ref read on a short tick.
 */
export function useVisitModals({ sceneReady, blocked, supportEligible, returningVisitor }: VisitModalInputs): VisitModalsController {
  const [open, setOpen] = useState<VisitModalName | null>(null);
  const session = useRef<Session>({ ...INITIAL_SESSION });
  const inputs = useRef<VisitModalInputs>({ sceneReady, blocked, supportEligible, returningVisitor });

  useEffect(() => {
    inputs.current = { sceneReady, blocked, supportEligible, returningVisitor };
  }, [sceneReady, blocked, supportEligible, returningVisitor]);

  /** One reading of the world, as the decision function wants it. */
  const stateAt = useCallback((nowMs: number): VisitModalState => {
    const held = session.current;
    return {
      nowMs,
      openModal: held.openModal,
      introShownAtMs: held.introShownAtMs,
      supportShownAtMs: held.supportShownAtMs,
      // An override from `?resetModals=1` is the visitor asking to be treated as new.
      returningVisitor: inputs.current.returningVisitor === true && !held.resetOverride,
      sponsorReferral: held.sponsorReferral,
      sceneReadyAtMs: held.sceneReadyAtMs,
      activeWatchMs: watchClockActiveMs(held.clock, nowMs),
      supportEligible: inputs.current.supportEligible,
      blocked: inputs.current.blocked,
      unblockedAtMs: held.unblockedAtMs,
      introClosedAtMs: held.introClosedAtMs,
    };
  }, []);

  const closeOpenModal = useCallback((report: (name: VisitModalName) => void) => {
    const held = session.current;
    const name = held.openModal;
    if (name === null) return;
    held.openModal = null;
    if (name === "intro") held.introClosedAtMs = Date.now();
    setOpen(null);
    report(name);
  }, []);

  const dismiss = useCallback((method: VisitModalDismissMethod) => {
    closeOpenModal((name) => trackVisitorEvent(`${name}_modal_dismissed`, { method }));
  }, [closeOpenModal]);

  const follow = useCallback<VisitModalsController["follow"]>((event) => {
    closeOpenModal(() => trackVisitorEvent(event));
  }, [closeOpenModal]);

  useEffect(() => {
    const held = session.current;
    if (new URLSearchParams(window.location.search).has(RESET_PARAM)) {
      resetAndReload();
      return;
    }
    held.sponsorReferral = hasSponsorReferral(window.location.search);
    held.resetOverride = readVisitModalReset();
    held.introShownAtMs = readVisitModalRecord(VISIT_MODAL_KEYS.intro);
    held.supportShownAtMs = readVisitModalRecord(VISIT_MODAL_KEYS.support);
    held.clock = watchClockAt(held.clock, activelyWatching(), Date.now());

    // The clock follows the tab and the window only. Nothing about a modal being
    // open changes it: an open modal is still this page being watched.
    const sample = () => {
      held.clock = watchClockAt(held.clock, activelyWatching(), Date.now());
    };
    document.addEventListener("visibilitychange", sample);
    window.addEventListener("blur", sample);
    window.addEventListener("focus", sample);

    let timer: number | null = null;
    const tick = () => {
      const nowMs = Date.now();
      sample();
      if (inputs.current.sceneReady && held.sceneReadyAtMs === null) held.sceneReadyAtMs = nowMs;
      if (inputs.current.blocked) {
        held.blockedNow = true;
        held.unblockedAtMs = null;
      } else if (held.blockedNow) {
        held.blockedNow = false;
        held.unblockedAtMs = nowMs;
      }
      const state = stateAt(nowMs);
      const next = nextVisitModal(state);
      if (next !== null && next !== held.openModal) {
        // Recorded the moment it is shown, so a crash or a close cannot re-arm it.
        const shownAt = Date.now();
        held.openModal = next;
        if (next === "intro") held.introShownAtMs = shownAt;
        else held.supportShownAtMs = shownAt;
        writeVisitModalRecord(VISIT_MODAL_KEYS[next], shownAt);
        setOpen(next);
        trackVisitorEvent(`${next}_modal_shown`, next === "support"
          ? { active_seconds: Math.round(state.activeWatchMs / 1_000) }
          : {});
      }
      if (visitModalsSettled(stateAt(Date.now())) && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    timer = window.setInterval(tick, VISIT_MODAL_TICK_MS);
    tick();

    return () => {
      document.removeEventListener("visibilitychange", sample);
      window.removeEventListener("blur", sample);
      window.removeEventListener("focus", sample);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [stateAt]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const global = window as typeof window & { __khwResetModals?: () => void };
    global.__khwResetModals = resetAndReload;
    return () => {
      delete global.__khwResetModals;
    };
  }, []);

  return { open, dismiss, follow };
}
