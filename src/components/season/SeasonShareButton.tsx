"use client";

import { shareCard } from "@/lib/share/client";

export function SeasonShareButton({ seasonNumber, text }: { seasonNumber: number; text: string }) {
  return <button type="button" className="primary-button" onClick={() => void shareCard({
    title: "Keep Him Walking",
    text,
    url: `${window.location.origin}/season/${seasonNumber}`,
    imageUrl: `${window.location.origin}/api/og/season/${seasonNumber}`,
    fileName: `keep-him-walking-season-${seasonNumber}.png`,
  })}>Share the season sheet</button>;
}
