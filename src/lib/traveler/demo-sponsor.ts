import type { BootstrapSnapshot } from "@/lib/contracts";

export function demoSponsorAllowed(env: Record<string,string|undefined>) {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "phase-3-launch-hardening";
}
export const DEMO_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#123c43"/><text x="64" y="85" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="72" fill="#ffdf83">K</text></svg>')}`;
export function sponsorPresentation(sponsor: BootstrapSnapshot["sponsor"], demo: boolean) {
  if (sponsor.status === "sponsored") return { demo:false, name:sponsor.name, disclosure:sponsor.disclosure,
    logo:sponsor.patchUrl, href:sponsor.clickUrl, cta:sponsor.ctaLabel ?? "Visit sponsor" };
  return demo ? {demo:true,name:"Keep Him Walking Demo",disclosure:"Demo sponsor · not a paid placement",
    logo:DEMO_LOGO,href:"/sponsor",cta:"Explore sponsorship"} : null;
}
