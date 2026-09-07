import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/components/traveler/CharacterReview",()=>({CharacterReview:()=>null}));
import CharacterReviewPage from "./page";
afterEach(()=>vi.unstubAllEnvs());
describe("character review environment gate",()=>{
  it("rejects Vercel production even when another environment flag says development",()=>{
    vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("NODE_ENV","development");
    expect(()=>CharacterReviewPage()).toThrow("NOT_FOUND");
  });
  it("rejects production builds that are not explicitly Vercel previews",()=>{
    vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV",undefined);
    expect(()=>CharacterReviewPage()).toThrow("NOT_FOUND");
  });
  it("allows explicit Vercel previews",()=>{
    vi.stubEnv("NODE_ENV","production");vi.stubEnv("VERCEL_ENV","preview");
    expect(CharacterReviewPage()).toBeTruthy();
  });
});
