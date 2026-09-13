export const LOCAL_SCENE_FALLBACK_URL = "/scenes/tashkent/v1/scene-fallback.webp";

/** One recovery attempt only; failure of the local poster falls back to the CSS sky/ground. */
export function localSceneFallbackAfter(failedUrl: string): string | null {
  try {
    const pathname = new URL(failedUrl, "https://keephimwalking.com").pathname;
    return pathname === LOCAL_SCENE_FALLBACK_URL ? null : LOCAL_SCENE_FALLBACK_URL;
  } catch {
    return LOCAL_SCENE_FALLBACK_URL;
  }
}
