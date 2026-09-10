import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrectionForm } from "./CorrectionForm";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CorrectionForm", () => {
  it("submits privately and never echoes the visitor's text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CorrectionForm packId="tashkent-v4" zones={[{ id: "arrival-boulevard", label: "Arrival boulevard" }]} />);
    await user.click(screen.getByText("Locals: tell us what we got wrong"));
    const privateText = "The local pronunciation needs a softer ending.";
    await user.type(screen.getByLabelText("Your correction"), privateText);
    await user.click(screen.getByRole("button", { name: "Send correction" }));
    await screen.findByText("Thank you. Your note is private and will be reviewed.");
    expect(screen.queryByText(privateText)).not.toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({ packId: "tashkent-v4", category: "place", body: privateText });
  });

  it("shows a useful failure without losing the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "You can send three corrections per hour." } }), { status: 429 })));
    const user = userEvent.setup();
    render(<CorrectionForm packId="tashkent-v4" />);
    await user.click(screen.getByText("Locals: tell us what we got wrong"));
    await user.type(screen.getByLabelText("Your correction"), "A private note.");
    await user.click(screen.getByRole("button", { name: "Send correction" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("three corrections per hour"));
    expect(screen.getByLabelText("Your correction")).toHaveValue("A private note.");
  });
});
