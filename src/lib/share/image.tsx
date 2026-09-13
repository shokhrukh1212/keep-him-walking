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
  const accent = input.accent ?? "#e6b754";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "68px 76px", color: "#fff5df", background: "linear-gradient(135deg,#102a32,#173f45 58%,#754f2b)", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: accent, fontSize: 22, letterSpacing: 4, textTransform: "uppercase" }}>{input.eyebrow}</div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.04, marginTop: 24, maxWidth: 1040 }}>{input.title}</div>
        {input.subtitle ? <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3, marginTop: 24, color: "#d7e3dc" }}>{input.subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 18 }}>
          {(input.stats ?? []).map((stat) => <div key={stat} style={{ display: "flex", padding: "14px 20px", border: "1px solid #ffffff38", borderRadius: 999, fontSize: 25 }}>{stat}</div>)}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#d7e3dc" }}>{input.footer ?? "keephimwalking.com"}</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: SHARE_IMAGE_HEADERS },
  );
}
