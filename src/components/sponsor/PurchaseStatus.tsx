"use client";

import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  checkout_pending: "Waiting for payment confirmation",
  paid_pending_review: "Payment received · creative review required",
  approved: "Creative approved",
  scheduled: "Approved and scheduled",
  live: "Sponsor placement is live",
  completed: "Sponsored country-day completed",
  rejected: "Creative was not approved",
  refunded: "Payment refunded · placement removed",
  cancelled: "Reservation cancelled",
};

export function PurchaseStatus({ purchase }: { purchase: string }) {
  const [status, setStatus] = useState("checkout_pending");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let attempts = 0; let timer: number | null = null;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/sponsor/status?purchase=${encodeURIComponent(purchase)}`, { cache: "no-store" });
        if (response.ok) {
          const result = await response.json() as { status: string };
          setStatus(result.status);
          if (result.status !== "checkout_pending") { setDone(true); return; }
        }
      } catch { /* A final manual refresh remains available. */ }
      if (attempts < 15) timer = window.setTimeout(() => void poll(), 2_000); else setDone(true);
    };
    void poll(); return () => { if (timer) window.clearTimeout(timer); };
  }, [purchase]);
  return <div className="purchase-status" role="status"><span className="eyebrow">PURCHASE STATUS</span><h2>{labels[status] ?? "Status unavailable"}</h2><p>{done ? "You can safely close this page. We will use the contact email for creative review." : "Confirming the signed payment webhook…"}</p></div>;
}
