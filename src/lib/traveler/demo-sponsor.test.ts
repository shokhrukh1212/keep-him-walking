import {describe,it,expect} from "vitest";
import {demoSponsorAllowed,demoSponsorLogoAllowed,safeDemoSponsorLogo,sponsorPresentation} from "./demo-sponsor";
describe("preview demonstration sponsor",()=>{
  it("fails closed outside the exact Preview branch",()=>{
    for(const env of [undefined,"production","development"])expect(demoSponsorAllowed({VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:"phase-3-launch-hardening"})).toBe(false);
    expect(demoSponsorAllowed({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main"})).toBe(false);
    expect(demoSponsorAllowed({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"phase-3-launch-hardening"})).toBe(true);
  });
  it("is explicitly a demo and never replaces real sponsor data",()=>{
    expect(sponsorPresentation({status:"unsponsored"},false)).toBeNull();
    expect(sponsorPresentation({status:"unsponsored"},true)?.disclosure).toContain("not a paid placement");
    expect(sponsorPresentation({status:"sponsored",publicId:"real",name:"Real",disclosure:"Sponsored",patchUrl:null,tier:"standard",bottleUrl:null,ctaLabel:null,clickUrl:null},true)?.demo).toBe(false);
  });

  it("allows the sales-DM logo preview everywhere except Production",()=>{
    expect(demoSponsorLogoAllowed({VERCEL_ENV:"production"})).toBe(false);
    expect(demoSponsorLogoAllowed({VERCEL_ENV:"preview"})).toBe(true);
    expect(demoSponsorLogoAllowed({})).toBe(true);
  });
  it("accepts only an absolute https logo and never anything executable",()=>{
    expect(safeDemoSponsorLogo("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    for(const value of [null,undefined,"","/local.png","http://example.com/logo.png","javascript:alert(1)","data:image/svg+xml,<svg/>"])
      expect(safeDemoSponsorLogo(value)).toBeNull();
  });
});
