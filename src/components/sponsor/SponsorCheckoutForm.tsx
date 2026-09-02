"use client";

import { FormEvent, useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";

export function SponsorCheckoutForm({ slots }: { slots: Array<{ id: string; label: string; priceCents: number; currency: string }> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/sponsor/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: form.get("slotId"), sponsorName: form.get("sponsorName"), sponsorEmail: form.get("sponsorEmail") }),
      });
      const result = await response.json() as { checkoutUrl?: string; error?: { message?: string } };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error?.message ?? "Checkout unavailable");
      trackVisitorEvent("sponsor_checkout_started", { slot_id: String(form.get("slotId")) });
      window.location.assign(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout unavailable"); setBusy(false); }
  };
  if (!slots.length) return <p>No country-days are currently available. Please check back after the preview schedule is configured.</p>;
  return <form className="sponsor-form" onSubmit={(event) => void submit(event)}>
    <label>Country-day<select name="slotId" required>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label} · {(slot.priceCents / 100).toLocaleString("en-US", { style: "currency", currency: slot.currency })}</option>)}</select></label>
    <label>Sponsor or organization name<input name="sponsorName" minLength={2} maxLength={100} required /></label>
    <label>Contact email<input name="sponsorEmail" type="email" autoComplete="email" required /></label>
    <p className="policy-copy">Payment reserves the day but does not publish a sponsor. Every creative is reviewed before approval and can be removed for policy or refund reasons.</p>
    <button className="primary-button" disabled={busy} type="submit">{busy ? "Opening checkout…" : "Continue to secure checkout"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </form>;
}
