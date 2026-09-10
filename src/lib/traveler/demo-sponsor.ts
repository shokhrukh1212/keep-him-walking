import type { BootstrapSnapshot } from "@/lib/contracts";

export function demoSponsorAllowed(env: Record<string,string|undefined>) {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "phase-3-launch-hardening";
}

/**
 * The sales-DM preview: render a prospect's own logo on the backpack so they can
 * see it before they buy. Hard-denied on Production. It is deliberately gated on
 * the deployment rather than on a preview session cookie, because reading a cookie
 * would make the landing page uncacheable for every real visitor; the capability
 * is only "draw an https image on the patch", stores nothing and reads nothing.
 */
export function demoSponsorLogoAllowed(env: Record<string,string|undefined>) {
  return env.VERCEL_ENV !== "production";
}

/** Only an absolute https image URL is ever accepted, and never persisted. */
export function safeDemoSponsorLogo(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
export const DEMO_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#123c43"/><text x="64" y="85" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="72" fill="#ffdf83">K</text></svg>')}`;
export function sponsorPresentation(sponsor: BootstrapSnapshot["sponsor"], demo: boolean) {
  if (sponsor.status === "sponsored") return { demo:false, name:sponsor.name, disclosure:sponsor.disclosure,
    logo:sponsor.patchUrl, bottle:sponsor.bottleUrl, href:sponsor.clickUrl, cta:sponsor.ctaLabel ?? "Visit sponsor" };
  return demo ? {demo:true,name:"Keep Him Walking Demo",disclosure:"Demo sponsor · not a paid placement",
    logo:DEMO_LOGO,bottle:null,href:"/sponsors",cta:"Explore sponsorship"} : null;
}
