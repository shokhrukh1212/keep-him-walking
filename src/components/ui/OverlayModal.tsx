"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "wide";
  testId?: string;
};

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "summary", "[tabindex]:not([tabindex='-1'])",
].join(",");

const subscribeNever = () => () => undefined;

/**
 * A viewport-bounded modal over the journey. The scene keeps animating beneath
 * it and nothing behind it moves or remounts: the page behind is only made inert
 * for keyboard and pointer, so the presence session, the canvases and their
 * layout are untouched. Escape, the close button and a tap on the scrim close it;
 * focus stays inside while open and returns to where it was.
 */
export function OverlayModal({ open, title, eyebrow, onClose, children, size = "default", testId }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = document.querySelector<HTMLElement>(".journey-shell");
    behind?.setAttribute("inert", "");
    const focus = window.requestAnimationFrame(() => closeButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const root = dialog.current;
      if (event.key !== "Tab" || !root) return;
      const candidates = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((item) => !item.closest("[hidden]"));
      // Controls inside a closed <details> have no boxes; without layout (tests) keep them all.
      const laidOut = candidates.filter((item) => item.getClientRects().length > 0);
      const items = laidOut.length > 0 ? laidOut : candidates;
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focus);
      document.removeEventListener("keydown", onKeyDown);
      behind?.removeAttribute("inert");
      if (restoreTo?.isConnected) window.requestAnimationFrame(() => restoreTo.focus());
    };
  }, [open]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="overlay-modal-root" data-testid={testId}>
      <div className="overlay-modal-scrim" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <div
        ref={dialog}
        className={`overlay-modal overlay-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="overlay-modal-header">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="overlay-modal-close"
            onClick={() => onCloseRef.current()}
            aria-label={`Close ${title}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="overlay-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
