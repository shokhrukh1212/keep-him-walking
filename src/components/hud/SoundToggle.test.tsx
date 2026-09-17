import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SoundToggle } from "./SoundToggle";

describe("SoundToggle", () => {
  it("is one pressed-state button whose name says what is on", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<SoundToggle enabled={false} available resumesOnTap={false} onToggle={onToggle} />);
    const off = screen.getByRole("button", { name: "Background music off" });
    expect(off).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(off);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<SoundToggle enabled available resumesOnTap={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Background music on" })).toHaveAttribute("aria-pressed", "true");

    rerender(<SoundToggle enabled={false} available resumesOnTap onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Background music off, resumes on your first tap" })).toBeInTheDocument();

    // A failed load stays pressable so the next press can refetch the file.
    rerender(<SoundToggle enabled={false} available={false} resumesOnTap={false} onToggle={onToggle} />);
    const failed = screen.getByRole("button", { name: "Background music could not be loaded — press to try again" });
    expect(failed).toBeEnabled();
    await userEvent.click(failed);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
