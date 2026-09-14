"use client";

import { useState } from "react";

/** Starts the provider checkout for an approved request. The server names the price. */
export function SeasonCheckoutButton({ publicId, label }: { publicId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/season-sponsor/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      const result = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: { message?: string } };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error?.message ?? "Checkout could not be started. Nothing was charged.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be started. Nothing was charged.");
      setBusy(false);
    }
  };
  return (
    <div className="season-checkout">
      <button className="primary-button" type="button" disabled={busy} onClick={() => void start()}>
        {busy ? "Opening secure checkout…" : label}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
