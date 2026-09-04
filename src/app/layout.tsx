import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { WebVitals } from "@/components/observability/WebVitals";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Keep Him Walking — one shared seven-country journey",
  description:
    "One traveler. One shared journey. He only walks while someone is watching.",
  openGraph: {
    title: "Keep Him Walking",
    description: "He only walks while someone is watching. Help one shared traveler cross seven countries.",
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
