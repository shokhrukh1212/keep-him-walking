import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { WebVitals } from "@/components/observability/WebVitals";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Keep Him Walking — live across the world",
  description:
    "One traveler. One country a day. He only moves while someone is watching — and the more people watch, the faster he goes. Tomorrow, the internet votes where he walks next.",
  openGraph: {
    title: "Keep Him Walking",
    description: "One traveler. One country a day. He only moves while someone is watching — and the more people watch, the faster he goes.",
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
    <html lang="en">
      <body>
        {children}
        <WebVitals />
      </body>
    </html>
  );
}
