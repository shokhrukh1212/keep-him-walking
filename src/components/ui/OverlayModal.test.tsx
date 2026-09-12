import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OverlayModal } from "./OverlayModal";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <main className="journey-shell">
        <button type="button" onClick={() => setOpen(true)}>Open Journey</button>
        <canvas data-testid="scene" />
      </main>
      <OverlayModal
        open={open}
        title="Journey"
        eyebrow="Paris · Day 1"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">First inside</button>
        <a href="/privacy">Last inside</a>
      </OverlayModal>
    </>
  );
}

describe("OverlayModal", () => {
  it("opens over the page without replacing it, and Escape returns focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scene = screen.getByTestId("scene");
    const trigger = screen.getByRole("button", { name: "Open Journey" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Journey" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body).toContainElement(dialog);
    expect(document.querySelector(".journey-shell")).not.toContainElement(dialog);
    expect(document.querySelector(".journey-shell")).toHaveAttribute("inert");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close Journey" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".journey-shell")).not.toHaveAttribute("inert");
    // The page behind is the same node: nothing was remounted.
    expect(screen.getByTestId("scene")).toBe(scene);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps Tab inside and closes from the X or the scrim", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open Journey" }));
    const close = screen.getByRole("button", { name: "Close Journey" });
    const last = screen.getByRole("link", { name: "Last inside" });
    await waitFor(() => expect(close).toHaveFocus());

    last.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Open Journey" }));
    await user.click(document.querySelector<HTMLElement>(".overlay-modal-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
