"use client";

import { FormEvent, useMemo, useState } from "react";
import { flagEmoji } from "@/lib/countries/flags";
import { formatPriceUsd } from "@/lib/sponsors/pricing";
import type { TicketDestination } from "@/lib/tickets/catalog";
import type { TicketDayChoice } from "@/lib/tickets/data";

export function TicketCheckoutForm({ days, destinations }: {
  days: TicketDayChoice[];
  destinations: TicketDestination[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slotId, setSlotId] = useState(days[0]?.slotId ?? "");
  const selected = useMemo(() => days.find((day) => day.slotId === slotId) ?? days[0], [days, slotId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/tickets/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: form.get("slotId"), packId: form.get("packId"),
          sponsorName: form.get("sponsorName"), sponsorEmail: form.get("sponsorEmail"),
        }),
      });
      const result = await response.json() as { checkoutUrl?: string; error?: { message?: string } };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error?.message ?? "Checkout unavailable");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout unavailable");
      setBusy(false);
    }
  }

  if (!days.length || !destinations.length) return <p>No eligible Ticket days are available right now.</p>;
  return <form className="sponsor-form" onSubmit={(event) => void submit(event)}>
    <label>Day
      <select name="slotId" required value={slotId} onChange={(event) => setSlotId(event.target.value)}>
        {days.map((day) => <option key={day.slotId} value={day.slotId}>Day {day.dayNumber} · {day.date}</option>)}
      </select>
    </label>
    <label>Country
      <select name="packId" required>
        {destinations.map((destination) => <option key={destination.packId} value={destination.packId}>
          {flagEmoji(destination.countryCode)} {destination.countryName} · {destination.cityName}
        </option>)}
      </select>
    </label>
    <p className="sponsor-price" data-testid="ticket-selected-price">
      <strong>{selected ? formatPriceUsd(selected.priceCents) : "—"}</strong> including Standard sponsorship
    </p>
    <label>Sponsor or organization name<input name="sponsorName" minLength={2} maxLength={100} required /></label>
    <label>Contact email<input name="sponsorEmail" type="email" autoComplete="email" required /></label>
    <p className="policy-copy">Payment reserves the day. The country changes only after creative approval, at least 24 hours before departure.</p>
    <button className="primary-button" disabled={busy} type="submit">{busy ? "Opening checkout…" : "Buy him a ticket"}</button>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </form>;
}
