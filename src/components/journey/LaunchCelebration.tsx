"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { OverlayModal } from "@/components/ui/OverlayModal";
import { ShareOnXLink } from "@/components/share/ShareOnXLink";

const CONFETTI = Array.from({ length: 24 }, (_, index) => index);

type Props = {
  startsAt: string;
  localTime: string;
  utcTime: string;
  shareText: string;
  sceneReady: boolean;
  blocked: boolean;
  /** The start moved from the first announcement: say why, in one line. */
  planChanged?: boolean;
  onOpenChange: (open: boolean) => void;
};

/** One cheerful announcement per tab session, after the traveler is on screen. */
export function LaunchCelebration({ startsAt, localTime, utcTime, shareText, sceneReady, blocked, planChanged = false, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpenChange(open);
    return () => onOpenChange(false);
  }, [onOpenChange, open]);
  useEffect(() => {
    if (!sceneReady || blocked) return;
    const key = `khw.launch-celebration.${startsAt}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch { /* A private browser can refuse storage; the current mount still shows once. */ }
    const timer = window.setTimeout(() => {
      try { window.sessionStorage.setItem(key, "shown"); } catch { /* Keep the modal usable. */ }
      setOpen(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [blocked, sceneReady, startsAt]);

  return (
    <OverlayModal open={open} eyebrow="Today in Paris" title="Milo starts walking today!"
      closeLabel="Close launch celebration" onClose={() => setOpen(false)} testId="launch-celebration">
      <div className="launch-celebration">
        <div className="launch-confetti" aria-hidden="true">
          {CONFETTI.map((piece) => <i key={piece} style={{ "--piece": piece } as CSSProperties} />)}
        </div>
        <p className="launch-celebration-time"><strong>{localTime}</strong> France time <span>· {utcTime} UTC</span></p>
        {planChanged ? <p data-testid="launch-plan-changed"><strong>The plan changed.</strong> Milo packed fourteen postcards of Paris instead of a route, so he&apos;s taking one more hour to get ready.</p> : null}
        <p>His journey begins in Paris. Come back to watch—Milo walks while someone is here with him.</p>
        <div className="visit-modal-actions">
          <ShareOnXLink text={shareText} className="visit-modal-primary" />
          <button type="button" onClick={() => setOpen(false)}>Keep watching</button>
        </div>
      </div>
    </OverlayModal>
  );
}
