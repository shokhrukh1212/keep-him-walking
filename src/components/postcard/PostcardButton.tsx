"use client";

import { useState } from "react";
import { trackVisitorEvent } from "@/lib/analytics/client";

export function PostcardButton({ countryDayId, eligible, unlockSeconds, contributedSeconds, existingUrl, sponsorPublicId }: {
  countryDayId: string;
  eligible: boolean;
  unlockSeconds: number;
  contributedSeconds: number;
  existingUrl: string | null;
  sponsorPublicId?: string;
}) {
  const [url, setUrl] = useState(existingUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const unlocked = eligible || contributedSeconds >= unlockSeconds;
  const create = async () => {
    if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/postcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryDayId }) });
      if (!response.ok) throw new Error("Postcard unavailable");
      const result = await response.json() as { url: string };
      setUrl(result.url);
      trackVisitorEvent("postcard_created", { country_day_id: countryDayId });
      if (navigator.share) {
        await navigator.share({ title: "Keep Him Walking postcard", url: result.url });
        trackVisitorEvent("postcard_shared", { country_day_id: countryDayId });
        if (sponsorPublicId) void fetch("/api/sponsor/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: sponsorPublicId, eventType: "postcard_shared" }) });
      } else await navigator.clipboard.writeText(result.url);
    } catch { setMessage("Postcard is temporarily unavailable."); } finally { setBusy(false); }
  };
  return (
    <div className="postcard-control">
      <button type="button" disabled={!unlocked || busy} onClick={() => void create()}>
        <span className="control-icon" aria-hidden="true">✦</span>
        {url ? "View postcard" : unlocked ? (busy ? "Creating…" : "Postcard") : `${Math.max(0, unlockSeconds - Math.floor(contributedSeconds))}s to postcard`}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
