"use client";

import { FormEvent, useState } from "react";

type Props = {
  packId: string;
  zones?: Array<{ id: string; label: string }>;
};

export function CorrectionForm({ packId, zones = [] }: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setStatus("sending");
    setMessage("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
          zoneId: String(form.get("zoneId") ?? "") || null,
          category: String(form.get("category") ?? "other"),
          body: String(form.get("body") ?? ""),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(result?.error?.message ?? "Please try again.");
      }
      formElement.reset();
      setStatus("sent");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  if (status === "sent") {
    return <p className="correction-thanks" role="status">Thank you. Your note is private and will be reviewed.</p>;
  }
  return (
    <details className="correction-form">
      <summary>Locals: tell us what we got wrong</summary>
      <form onSubmit={submit}>
        {zones.length > 0 ? <label>Part of the walk
          <select name="zoneId" defaultValue="">
            <option value="">The city in general</option>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
          </select>
        </label> : null}
        <label>What needs attention?
          <select name="category" defaultValue="place">
            <option value="place">Place</option><option value="phrase">Phrase</option>
            <option value="dialogue">Dialogue</option><option value="art">Artwork</option><option value="other">Other</option>
          </select>
        </label>
        <label>Your correction
          <textarea name="body" required minLength={1} maxLength={280} rows={4} />
        </label>
        <small>Your note stays private. No email is collected.</small>
        <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send correction"}</button>
        {status === "error" ? <p role="alert">{message}</p> : null}
      </form>
    </details>
  );
}
