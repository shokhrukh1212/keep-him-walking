"use client";

import { useState } from "react";
import { tashkentLocalToUtc } from "@/lib/relaunch/config";

type Journey = { id: string; lifecycle_state: "waiting" | "scheduled" | "live" | "ended"; scheduled_start_at: string | null };
type Order = { id: string; product_name: string; tier: string; status: string; moderation_reason: string | null };

export function JourneyOperations({ initialJourney, orders }: { initialJourney: Journey; orders: Order[] }) {
  const [journey, setJourney] = useState(initialJourney);
  const [schedule, setSchedule] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (action: "waiting" | "schedule" | "cancel" | "start") => {
    setBusy(true); setMessage(null);
    const scheduledStartAt = action === "schedule" ? tashkentLocalToUtc(schedule) : null;
    const response = await fetch(`/api/admin/journeys/${journey.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, scheduledStartAt }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "The journey was not changed."); return; }
    setJourney((current) => ({ ...current, lifecycle_state: payload.state, scheduled_start_at: payload.scheduledStartAt ?? null }));
    setMessage(`Journey is now ${payload.state}.`);
  };
  const review = async (id: string, action: "approve" | "remove") => {
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/admin/sponsor-placements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: action === "remove" ? "moderation_removed" : null }) });
    const payload = await response.json(); setBusy(false);
    setMessage(response.ok ? `Placement ${action}d.` : payload.error?.message ?? "Placement was not changed.");
    if (response.ok) window.location.reload();
  };
  return <div className="admin-journey-operations">
    <section className="admin-card">
      <h2>Paris journey</h2>
      <p><strong>State:</strong> {journey.lifecycle_state}</p>
      {journey.scheduled_start_at ? <p><strong>Scheduled:</strong> {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(journey.scheduled_start_at))} Tashkent time</p> : null}
      <label>Launch time in Asia/Tashkent (UTC+5)<input type="datetime-local" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
      {tashkentLocalToUtc(schedule) ? <p><strong>Resolved UTC:</strong> {tashkentLocalToUtc(schedule)?.replace(".000Z", "Z")}</p> : null}
      <div className="admin-actions">
        <button disabled={busy || !schedule || journey.lifecycle_state === "live" || journey.lifecycle_state === "ended"} onClick={() => void act("schedule")}>Schedule launch</button>
        <button disabled={busy || journey.lifecycle_state !== "scheduled"} onClick={() => void act("cancel")}>Cancel schedule</button>
        <button disabled={busy || journey.lifecycle_state === "live" || journey.lifecycle_state === "ended"} onClick={() => void act("start")}>Start now</button>
        <button disabled={busy || journey.lifecycle_state === "live" || journey.lifecycle_state === "ended"} onClick={() => void act("waiting")}>Waiting</button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
    <section className="admin-card"><h2>Flagged placements</h2>
      {orders.length === 0 ? <p>Nothing needs review.</p> : orders.map((order) => <article key={order.id}>
        <p><strong>{order.product_name}</strong> · {order.tier} · {order.status}</p>
        <p>{order.moderation_reason ?? "No reason recorded"}</p>
        <div className="admin-actions"><button disabled={busy} onClick={() => void review(order.id, "approve")}>Approve</button><button disabled={busy} onClick={() => void review(order.id, "remove")}>Remove and refund</button></div>
      </article>)}
    </section>
  </div>;
}
