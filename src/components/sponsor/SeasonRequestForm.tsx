"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { SEASON_REQUEST_LIMITS } from "@/lib/sponsors/season-request";
import { formatUsdCents } from "@/lib/sponsors/season-offer";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "redirecting" }
  | { kind: "sent"; statusUrl: string }
  | { kind: "error"; message: string };

/**
 * The compact submission. While checkout is open the server answers with the provider's
 * checkout URL and the browser goes straight there; the price is named by the server,
 * never by this form.
 */
export function SeasonRequestForm({
  seasonId,
  checkoutEnabled,
  priceCents,
}: {
  seasonId: string;
  checkoutEnabled: boolean;
  priceCents: number;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/season-sponsor/requests", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json().catch(() => ({})) as { statusUrl?: string; checkoutUrl?: string | null; error?: { message?: string } };
      if (!response.ok || !result.statusUrl) throw new Error(result.error?.message ?? "The request could not be sent. Please try again.");
      if (result.checkoutUrl) {
        setState({ kind: "redirecting" });
        window.location.assign(result.checkoutUrl);
        return;
      }
      setState({ kind: "sent", statusUrl: result.statusUrl });
    } catch (cause) {
      setState({ kind: "error", message: cause instanceof Error ? cause.message : "The request could not be sent. Please try again." });
    }
  };

  if (state.kind === "redirecting") {
    return (
      <div className="purchase-status" role="status" data-testid="season-checkout-redirect">
        <span className="eyebrow">TAKING YOU TO CHECKOUT</span>
        <h2>Opening secure checkout…</h2>
        <p>Nothing has been charged yet. The payment page is opening now.</p>
      </div>
    );
  }

  if (state.kind === "sent") {
    return (
      <div className="purchase-status" role="status" data-testid="season-request-sent">
        <span className="eyebrow">DETAILS SAVED</span>
        <h2>Saved. Nothing has been charged.</h2>
        <p>
          {checkoutEnabled
            ? "Checkout could not be opened just now. Your details are safe and the season is not booked or reserved. Continue from this private link: "
            : "This is a request, not a booking: it takes no payment and does not reserve the season. Keep this private link to see where it stands: "}
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
      <label className="sponsor-rights">
        <input type="checkbox" name="policiesAccepted" value="true" required />
        <span>
          I agree to the <Link href="/sponsor-terms" target="_blank" rel="noopener">Sponsor Terms</Link> and the{" "}
          <Link href="/content-moderation" target="_blank" rel="noopener">Content &amp; Listing Moderation Policy</Link>.
        </span>
      </label>
      <p className="policy-copy">
        {checkoutEnabled
          ? `This takes you straight to secure checkout at ${formatUsdCents(priceCents)}. Your placement goes live once the payment processor confirms the payment, and the sponsor you replace is refunded in full.`
          : "This is a request, not a booking. It takes no payment and does not reserve the season. Checkout opens only after our payment provider has approved this offer."}
      </p>
      <button className="primary-button" type="submit" disabled={state.kind === "sending"}>
        {state.kind === "sending"
          ? (checkoutEnabled ? "Opening checkout…" : "Sending…")
          : checkoutEnabled ? `Continue to checkout · ${formatUsdCents(priceCents)}` : "Request this season"}
      </button>
      {state.kind === "error" ? <p className="form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
