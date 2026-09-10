"use client";

import { FormEvent, useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";
import { formatPriceUsd, tierPriceCents, type SponsorTier } from "@/lib/sponsors/pricing";

export type SponsorSlotChoice = {
  id: string;
  label: string;
  priceCents: number;
  currency: string;
};

export function SponsorCheckoutForm({
  slots,
  premiumMultiplier,
}: {
  slots: SponsorSlotChoice[];
  premiumMultiplier: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slotId, setSlotId] = useState(slots[0]?.id ?? "");
  const [tier, setTier] = useState<SponsorTier>("standard");

  const selected = slots.find((slot) => slot.id === slotId) ?? slots[0];
  // The displayed price mirrors the same pure helper the server prices with; the
  // server still prices the reservation itself, and no amount is ever sent here.
  const shownPrice = selected ? tierPriceCents(selected.priceCents, tier, premiumMultiplier) : 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/sponsor/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: form.get("slotId"),
          sponsorName: form.get("sponsorName"),
          sponsorEmail: form.get("sponsorEmail"),
          tier: form.get("tier"),
        }),
      });
      const result = await response.json() as { checkoutUrl?: string; error?: { message?: string } };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error?.message ?? "Checkout unavailable");
      trackVisitorEvent("sponsor_checkout_started", { slot_id: String(form.get("slotId")), tier: String(form.get("tier")) });
      window.location.assign(result.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Checkout unavailable"); setBusy(false); }
  };

  if (!slots.length) return <p>No days are currently open for sale. The next day opens at the daily rollover.</p>;

  return <form className="sponsor-form" onSubmit={(event) => void submit(event)}>
    <label>Day
      <select name="slotId" required value={slotId} onChange={(event) => setSlotId(event.target.value)}>
        {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
      </select>
    </label>
    <label>Tier
      <select name="tier" value={tier} onChange={(event) => setTier(event.target.value as SponsorTier)}>
        <option value="standard">Standard</option>
        <option value="premium">Premium — he drinks from your bottle</option>
      </select>
    </label>
    <p className="sponsor-price" data-testid="sponsor-selected-price">
      <strong>{formatPriceUsd(shownPrice)}</strong> for {selected?.label ?? "the selected day"}
    </p>
    <label>Sponsor or organization name<input name="sponsorName" minLength={2} maxLength={100} required /></label>
    <label>Contact email<input name="sponsorEmail" type="email" autoComplete="email" required /></label>
    <p className="policy-copy">Payment reserves the day but does not publish a sponsor. Every creative is reviewed before approval and can be removed for policy or refund reasons.</p>
    <button className="primary-button" disabled={busy} type="submit">{busy ? "Opening checkout…" : "Continue to secure checkout"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </form>;
}
