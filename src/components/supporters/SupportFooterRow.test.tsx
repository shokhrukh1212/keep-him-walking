import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SupportFooterRow } from "./SupportFooterRow";

describe("SupportFooterRow", () => {
  it("uses the configured profile as a safe ordinary new-tab link", () => {
    render(<SupportFooterRow coffeeUrl="https://buymeacoffee.com/keepwalking" onSupportersOpen={vi.fn()} />);
    expect(screen.getByRole("link", { name: /buy him a coffee/i })).toHaveAttribute("href", "https://buymeacoffee.com/keepwalking");
    expect(screen.getByRole("link", { name: /buy him a coffee/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /buy him a coffee/i })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not invent a destination and still opens Supporters", async () => {
    const open = vi.fn();
    render(<SupportFooterRow coffeeUrl={null} onSupportersOpen={open} />);
    expect(screen.queryByRole("link", { name: /buy him a coffee/i })).not.toBeInTheDocument();
    expect(screen.getByText(/buy him a coffee/i)).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Supporters" }));
    expect(open).toHaveBeenCalledOnce();
  });
});
