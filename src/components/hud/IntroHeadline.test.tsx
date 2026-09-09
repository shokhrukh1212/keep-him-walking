import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntroHeadline } from "./IntroHeadline";

describe("IntroHeadline", () => {
  it("shows the first-watcher wait facts during the wake beat", () => {
    render(
      <IntroHeadline
        collapsed={false}
        firstArrival={{ waitingLocalTime: "03:12", waitedDuration: "2h 41m", countdown: 3 }}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      "He's been waiting since 03:12 (2h 41m).",
    );
    expect(screen.getByText("You're the first person here.")).toBeInTheDocument();
    expect(screen.getByText("Keep watching · he starts walking in 3…")).toBeInTheDocument();
  });
});
