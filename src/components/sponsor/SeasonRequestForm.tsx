"use client";

import { FormEvent, useState } from "react";
import { SEASON_REQUEST_LIMITS } from "@/lib/sponsors/season-request";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; statusUrl: string }
  | { kind: "error"; message: string };

/** The compact submission. Nothing here reserves the season or asks for payment. */
export function SeasonRequestForm({ seasonId, checkoutEnabled }: { seasonId: string; checkoutEnabled: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/season-sponsor/requests", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json().catch(() => ({})) as { statusUrl?: string; error?: { message?: string } };
      if (!response.ok || !result.statusUrl) throw new Error(result.error?.message ?? "The request could not be sent. Please try again.");
      setState({ kind: "sent", statusUrl: result.statusUrl });
    } catch (cause) {
      setState({ kind: "error", message: cause instanceof Error ? cause.message : "The request could not be sent. Please try again." });
    }
  };

  if (state.kind === "sent") {
    return (
      <div className="purchase-status" role="status" data-testid="season-request-sent">
        <span className="eyebrow">REQUEST RECEIVED</span>
        <h2>Thank you. Nothing has been charged.</h2>
        <p>
          We review every request by hand and reply by email. Keep this private link to see where your request stands:{" "}
          <a href={state.statusUrl}>{state.statusUrl}</a>
        </p>
      </div>
    );
  }

  const limits = SEASON_REQUEST_LIMITS;
  return (
    <form className="sponsor-form season-request-form" onSubmit={(event) => void submit(event)}>
      <input type="hidden" name="seasonId" value={seasonId} />
      <label>Product or company name
        <input name="productName" required minLength={limits.productName.min} maxLength={limits.productName.max} autoComplete="organization" />
      </label>
      <label>Website
        <input name="website" type="url" required maxLength={limits.website.max} placeholder="https://" pattern="https://.+" />
      </label>
      <label>One short, factual description
        <input name="description" required minLength={limits.description.min} maxLength={limits.description.max} />
      </label>
      <label>Logo · PNG, JPEG or WebP, up to 1 MB
        <input name="logo" type="file" required accept="image/png,image/jpeg,image/webp" />
      </label>
      <label>Your name
        <input name="contactName" required minLength={limits.contactName.min} maxLength={limits.contactName.max} autoComplete="name" />
      </label>
      <label>Contact email · never published
        <input name="contactEmail" type="email" required maxLength={limits.email.max} autoComplete="email" />
      </label>
      <label className="sponsor-rights">
        <input type="checkbox" name="rightsConfirmed" value="true" required />
        <span>I confirm I have the right to use this name, logo and website for this placement.</span>
      </label>
      <p className="policy-copy">
        {checkoutEnabled
          ? "Material is reviewed before any payment. Approved material receives a secure payment link for USD 499.00."
          : "This is a request, not a booking. It takes no payment and does not reserve the season. Checkout opens only after our payment provider has approved this offer."}
      </p>
      <button className="primary-button" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : checkoutEnabled ? "Submit for review" : "Request this season"}
      </button>
      {state.kind === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
