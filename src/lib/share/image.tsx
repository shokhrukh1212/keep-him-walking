import "server-only";
import { ImageResponse } from "next/og";

export const SHARE_IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
  "Content-Type": "image/png",
};

export function shareImage(input: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: string[];
  footer?: string;
  accent?: string;
}) {
  const accent = input.accent ?? "#d7a34e";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "68px 76px", color: "#f3e7c7", background: "#080f19", fontFamily: "sans-serif", borderBottom: "18px solid #a33e35" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: accent, fontSize: 22, letterSpacing: 4, textTransform: "uppercase" }}>{input.eyebrow}</div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.04, marginTop: 24, maxWidth: 1040 }}>{input.title}</div>
        {input.subtitle ? <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3, marginTop: 24, color: "#bfb8a5" }}>{input.subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 18 }}>
          {(input.stats ?? []).map((stat) => <div key={stat} style={{ display: "flex", padding: "14px 20px", border: "1px solid #f3e7c757", borderRadius: 8, fontSize: 25 }}>{stat}</div>)}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#bfb8a5" }}>{input.footer ?? "keephimwalking.com"}</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: SHARE_IMAGE_HEADERS },
  );
}
