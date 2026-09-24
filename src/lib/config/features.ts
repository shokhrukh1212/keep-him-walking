/**
 * Coffee/supporter surfaces are intentionally parked for the Paris relaunch.
 * The data and reusable components remain intact so the owner can revisit the feature
 * without leaving an empty row in the live layout.
 */
export const PUBLIC_SUPPORT_FEATURE_ENABLED = false;

/** New sponsor sales are paused for the free Paris launch; past payment webhooks remain live. */
export const PUBLIC_SPONSOR_SALES_ENABLED = false;

/**
 * The one-off Paris readiness episode (16:00–17:00 UTC, 24 September 2026). Rollback without
 * touching the departure or any payment: set NEXT_PUBLIC_PARIS_EPISODE=off and redeploy.
 */
export const PARIS_EPISODE_ENABLED = process.env.NEXT_PUBLIC_PARIS_EPISODE !== "off";

/** Episode 2, "Route rescue" (17:00–18:00 UTC). NEXT_PUBLIC_PARIS_EPISODE2=off falls back to Episode 1's closing state. */
export const PARIS_EPISODE2_ENABLED = process.env.NEXT_PUBLIC_PARIS_EPISODE2 !== "off";
