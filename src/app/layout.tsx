import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { WebVitals } from "@/components/observability/WebVitals";
import "./globals.css";

const anton = localFont({
  src: "./fonts/anton-latin.woff2",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
  variable: "--font-anton",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  fallback: ["Consolas", "Liberation Mono", "monospace"],
  adjustFontFallback: "Arial",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Keep Him Walking — live across the world",
  description:
    "One traveler. One country a day. He only moves while someone is watching. Tomorrow, the internet votes where he walks next.",
  openGraph: {
    title: "Keep Him Walking",
    description: "One traveler. One country a day. He only moves while someone is watching.",
    images: ["/api/og/day"],
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101b24",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <WebVitals />
      </body>
    </html>
  );
}
