import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const production = process.env.VERCEL_ENV === "production";
  return production
    ? { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/preview/"] }, sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
