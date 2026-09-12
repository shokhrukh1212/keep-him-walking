import type { NextConfig } from "next";
import { validateAssetBaseUrl } from "./src/lib/assets/url";
import { characterHeightTargetsFromEnv } from "./src/lib/world/stage-targets";

const characterHeightTargets = characterHeightTargetsFromEnv(process.env);

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
    // Non-secret visual configuration consumed by client renderers at build time.
    TARGET_CHARACTER_HEIGHT_FRAC: String(characterHeightTargets.desktop),
    TARGET_CHARACTER_HEIGHT_FRAC_MOBILE: String(characterHeightTargets.mobile),
  },
  experimental: {
    // Next 16's CLI parser can intermittently reject valid `tsc --showConfig`
    // output in constrained build environments. The compiler API performs the
    // same build-time type check without the subprocess parsing boundary.
    useTypeScriptCli: false,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Scene renditions are content-addressed (`city-full-2560.<hash>.webp`), so a
        // URL's bytes can never change and browsers may keep them for a year.
        source: "/scenes/:city/:version/places/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
