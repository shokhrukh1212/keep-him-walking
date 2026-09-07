import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return ["", "/archive", "/sponsor", "/privacy", "/sponsor-terms", "/refund-policy", "/contact"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-09-04T00:00:00.000Z"),
    changeFrequency: path === "" ? "daily" as const : "monthly" as const,
    priority: path === "" ? 1 : 0.5,
  }));
}
