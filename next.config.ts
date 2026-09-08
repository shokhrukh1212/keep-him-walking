import type { NextConfig } from "next";
import { validateAssetBaseUrl } from "./src/lib/assets/url";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_ASSET_BASE_URL: validateAssetBaseUrl(process.env.ASSET_BASE_URL),
  },
  experimental: {
    // Next 16's CLI parser can intermittently reject valid `tsc --showConfig`
    // output in constrained build environments. The compiler API performs the
    // same build-time type check without the subprocess parsing boundary.
    useTypeScriptCli: false,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
