"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/admin/CopyButton";
import type { AdminSeasonBooking } from "@/lib/sponsors/season-data";
import { formatUsdCents } from "@/lib/sponsors/season-offer";

type Action = "approve" | "reject" | "cancel" | "remove" | "require_refund" | "refund" | "mark_refunded";

const ACTIONS: Record<string, Array<[Action, string]>> = {
  submitted: [["approve", "Approve material"], ["reject", "Reject"], ["cancel", "Cancel"]],
  approved: [["reject", "Reject"], ["cancel", "Cancel"]],
  payment_pending: [["cancel", "Cancel hold"]],
  scheduled: [["require_refund", "Cancel and refund"]],
  active: [["remove", "Remove, no refund"], ["require_refund", "Remove and refund"]],
  completed: [["require_refund", "Refund"]],
  refund_required: [["refund", "Request provider refund"], ["mark_refunded", "Mark refunded"]],
};

function when(value: string | null) {
  return value ? new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}

export function SeasonSponsorQueue({ bookings }: { bookings: AdminSeasonBooking[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function act(id: string, action: Action) {
    setPending(id);
    setError("");
    const response = await fetch(`/api/admin/season-sponsors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    setPending(null);
    if (!response.ok) {
      setError(result.error?.message ?? "That action was not saved. Reload before trying again.");
      return;
    }
    router.refresh();
  }

  if (bookings.length === 0) return <p>No season sponsorship requests yet.</p>;
  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <ol className="correction-queue season-sponsor-queue">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <div>
              <strong>Season {booking.season.number}</strong> · {booking.status}
              {booking.statusReason ? ` (${booking.statusReason})` : ""}
              {booking.testMode ? " · TEST" : ""}
            </div>
            <div className="season-sponsor-queue-body">
              {booking.privateLogoUrl
                /* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */
                ? <img src={booking.privateLogoUrl} alt={`Submitted logo for ${booking.productName}`} width={64} height={64} />
                : null}
              <div>
                <p><strong>{booking.productName}</strong> · <a href={booking.websiteUrl} target="_blank" rel="noopener noreferrer">{booking.websiteUrl}</a></p>
                <p>{booking.description}</p>
                <p>Contact: {booking.contactName} · {booking.contactEmail}</p>
                <p>Quoted price: {formatUsdCents(booking.priceCents)} · preserved for this request</p>
                {["approved", "payment_pending"].includes(booking.status) ? <p className="season-continuation-link">
                  Continuation link to send to {booking.contactEmail}: <a href={booking.continuationUrl}>{booking.continuationUrl}</a>{" "}
                  <CopyButton value={booking.continuationUrl} />
                </p> : null}
                <small>
                  Submitted {when(booking.submittedAt)} · paid {when(booking.paidAt)} · delivered {when(booking.deliveredFrom)} → {when(booking.deliveredUntil)}
                  {booking.holdExpiresAt ? ` · hold until ${when(booking.holdExpiresAt)}` : ""}
                  {booking.metrics ? ` · ${booking.metrics.impressions} views · ${booking.metrics.clicks} clicks` : ""}
                </small>
                {booking.payments.map((payment) => (
                  <small key={payment.paymentId}>
                    {" "}· payment {payment.paymentId}: {payment.outcome}{payment.reason ? ` (${payment.reason})` : ""}
                    {payment.amountCents !== null ? ` · ${payment.amountCents}¢` : ""}
                    {payment.taxCents ? ` incl. ${payment.taxCents}¢ tax` : ""}
                    {payment.disputeState ? ` · dispute ${payment.disputeState}` : ""}
                  </small>
                ))}
              </div>
            </div>
            <div className="correction-actions">
              {(ACTIONS[booking.status] ?? []).map(([action, label]) => (
                <button key={action} type="button" disabled={pending === booking.id} onClick={() => void act(booking.id, action)}>
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
