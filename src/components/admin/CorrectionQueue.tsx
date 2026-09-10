"use client";

import { useState } from "react";
import type { CorrectionRow } from "@/lib/corrections/data";

export function CorrectionQueue({ initialRows }: { initialRows: CorrectionRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState("");
  async function moderate(id: number, status: "accepted" | "rejected") {
    setError("");
    const response = await fetch(`/api/admin/corrections/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError("That decision was not saved. Reload before trying again.");
      return;
    }
    setRows((current) => current.filter((row) => row.id !== id));
  }
  if (rows.length === 0) return <p>No new corrections.</p>;
  return <>
    {error ? <p role="alert">{error}</p> : null}
    <ol className="correction-queue">
      {rows.map((row) => <li key={row.id}>
        <div><strong>{row.pack_id}</strong>{row.zone_id ? ` · ${row.zone_id}` : ""} · {row.category} · {row.country_code.trim()}</div>
        <p>{row.body}</p>
        <small>{new Date(row.created_at).toISOString()}</small>
        <div className="correction-actions">
          <button type="button" onClick={() => void moderate(row.id, "accepted")}>Accept</button>
          <button type="button" onClick={() => void moderate(row.id, "rejected")}>Reject</button>
        </div>
      </li>)}
    </ol>
  </>;
}
