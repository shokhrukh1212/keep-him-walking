import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
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
  metadataBase: new URL("https://keephimwalking.com"),
  title: "Keep Him Walking — The Anniversary Journey",
  description: "A fourteen-day virtual journey, September 17–30. He only walks while someone is watching. Help choose the anniversary setting in Tashkent.",
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/favicon.ico", type: "image/x-icon" }] },
  openGraph: {
    title: "Keep Him Walking — The Anniversary Journey",
    description: "A fourteen-day virtual journey, September 17–30. He only walks while someone is watching. Help choose the anniversary setting in Tashkent.",
    url: "/",
    siteName: "Keep Him Walking",
    images: [{
      url: "/og-image.png?v=1",
      width: 1200,
      height: 630,
      alt: "Keep Him Walking — he only walks while someone is watching.",
    }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Keep Him Walking — The Anniversary Journey",
    description: "A fourteen-day virtual journey, September 17–30. He only walks while someone is watching. Help choose the anniversary setting in Tashkent.",
    images: [{ url: "/og-image.png?v=1", alt: "Keep Him Walking — he only walks while someone is watching." }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080f19",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <WebVitals />
        <Script
          src="https://datafa.st/js/script.js"
          data-website-id="dfid_IXxIkhyG6bDLApMMLYw3U"
          data-domain="keephimwalking.com"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
