import type { PreviewCaptionSnapshot } from "@/lib/preview/controller";
import styles from "./preview-caption.module.css";

type Props = {
  caption: PreviewCaptionSnapshot;
  reducedMotion: boolean;
};

/**
 * What he is saying during the prelaunch preview. The monologue controller owns it: it shows
 * exactly while he speaks and is gone the moment he stops, with no timer of its own. It takes
 * no focus and is not read cue by cue; the page's live region announces each line once.
 * On a phone its band keeps the same room whether he is speaking or not, so nothing moves.
 */
export function PreviewCaption({ caption, reducedMotion }: Props) {
  return (
    <div className={styles.band} data-testid="preview-caption-band" aria-hidden="true">
      <p
        className={styles.caption}
        data-testid="preview-caption"
        data-speaking={caption.speaking}
        data-line-id={caption.lineId ?? ""}
        data-cue-index={caption.cueIndex}
        data-sequence={caption.sequence}
        data-motion={reducedMotion ? "reduced" : "full"}
      >
        {/* Keyed by the monologue, so the short fade-in plays when he starts and never between cues. */}
        <span key={caption.sequence} className={styles.cue}>{caption.speaking ? caption.cueText : ""}</span>
      </p>
    </div>
  );
}
