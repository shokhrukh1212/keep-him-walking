"use client";

import { shareCard } from "@/lib/share/client";

export function CountryShareButton({ code, text }: { code: string; text: string }) {
  return <button type="button" onClick={() => void shareCard({
    title: "Keep Him Walking",
    text,
    url: `${window.location.origin}/country/${code.toLowerCase()}`,
    imageUrl: `${window.location.origin}/api/og/country/${code.toLowerCase()}`,
    fileName: `keep-him-walking-${code.toLowerCase()}.png`,
  })}>Share this result</button>;
}
