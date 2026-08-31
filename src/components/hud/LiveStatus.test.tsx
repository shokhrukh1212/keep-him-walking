import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveStatus } from "./LiveStatus";

describe("LiveStatus", () => {
  it("never invents a count while offline", () => {
    render(<LiveStatus activeViewers={null} walking={false} status="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Live count unavailable");
    expect(screen.queryByText(/people watching/)).not.toBeInTheDocument();
  });

  it("explains the walking rule when live", () => {
    render(<LiveStatus activeViewers={2} walking status="live" />);
    expect(screen.getByRole("status")).toHaveTextContent("2 people watching");
    expect(screen.getByRole("status")).toHaveTextContent("keeping him moving");
  });
});
