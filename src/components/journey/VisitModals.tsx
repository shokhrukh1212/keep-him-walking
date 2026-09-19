"use client";

import { OverlayModal } from "@/components/ui/OverlayModal";
import type { VisitModalName } from "@/lib/ui/visit-modals";
import type { VisitModalsController } from "@/hooks/useVisitModals";

type Props = {
  /** The queue's decision; null renders nothing at all. */
  open: VisitModalName | null;
  controller: VisitModalsController;
  /** How many countries the season crosses, and in how many days. */
  totalDays: number;
  /**
   * Where he is, in one sentence, already matched to the state the status line
   * names — a live day, a preview before the season, or a finished season.
   */
  whereLine: string;
  /** The header pill's number: DataFast's people with the site open, never below the confirmed watchers. */
  watcherCount: number | null | undefined;
  /** The Buy Me a Coffee profile, or null when the owner has not configured one. */
  coffeeUrl: string | null;
  /** Opens the Journey panel, exactly as the dock's Journey button does. */
  onJourney: () => void;
  /** Opens the sponsor offer, exactly as the dock's Sponsor button does. */
  onSponsor: () => void;
};

/**
 * The two one-time visitor modals, in the Journey panel's own chrome: the same
 * `OverlayModal` — dark panel, amber eyebrow, display heading, circular close —
 * so there is one modal system on this page and not two.
 *
 * Neither modal touches the walk. They are portalled over the scene like every
 * other panel, the page behind is only made inert, and the presence heartbeat
 * goes on reporting this visitor as watching the whole time one is open.
 */
export function VisitModals({
  open, controller, totalDays, whereLine, watcherCount, coffeeUrl, onJourney, onSponsor,
}: Props) {
  const { dismiss, follow } = controller;
  return (
    <>
      <OverlayModal
        open={open === "intro"}
        eyebrow="Welcome"
        title="He only walks while someone is watching."
        closeLabel="Close the introduction"
        onClose={dismiss}
        testId="intro-modal"
      >
        <div className="visit-modal">
          <p>
            That&apos;s the entire thing. He&apos;s crossing {totalDays} countries in {totalDays} days,
            and he moves only while at least one person has this page open. When the last tab closes,
            he stops where he stands and waits.
          </p>
          <p>{whereLine}</p>
          {/* The header's count, worded for one visitor. Nothing is shown when it is not confirmed. */}
          {typeof watcherCount === "number" && watcherCount > 0 ? (
            <p className="visit-modal-live" data-testid="intro-modal-watchers">
              You&apos;re one of {watcherCount} {watcherCount === 1 ? "person" : "people"} keeping him moving.
            </p>
          ) : null}
          <div className="visit-modal-actions">
            <button className="visit-modal-primary" type="button" onClick={() => dismiss("button")}>
              Start watching
            </button>
          </div>
          <button
            className="visit-modal-quiet"
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              follow("intro_modal_journey_click");
              onJourney();
            }}
          >
            What is this?
          </button>
        </div>
      </OverlayModal>

      <OverlayModal
        open={open === "support"}
        eyebrow="Still here"
        title={"You’ve kept him walking for a minute."}
        closeLabel="Close this message"
        onClose={dismiss}
        testId="support-modal"
      >
        <div className="visit-modal">
          {/* No metres: the server confirms watched seconds, never a per-visitor distance,
              and this page never turns one into the other. */}
          <p>
            He&apos;s still moving because you stayed. Watching is free and always will be — no account,
            no paywall, nothing gated.
          </p>
          <p>
            If you are building something, you can put your product beside the journey.
            There are ten regular placements and one separate featured placement.
          </p>
          <div className="visit-modal-actions">
            <button
              className="visit-modal-primary"
              type="button"
              onClick={() => {
                follow("support_modal_sponsor_click");
                onSponsor();
              }}
            >
              See sponsor placements
            </button>
            {coffeeUrl ? (
              <a
                href={coffeeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => follow("support_modal_coffee_click")}
              >
                Buy him a coffee ↗
              </a>
            ) : null}
          </div>
          <button className="visit-modal-quiet" type="button" onClick={() => dismiss("button")}>
            Just watching
          </button>
        </div>
      </OverlayModal>
    </>
  );
}
