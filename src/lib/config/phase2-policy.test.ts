import { describe, expect, it } from "vitest";
import { fixturePaymentsAllowed, phase2DeploymentAllowed } from "./phase2-policy";

const preview = {
  PHASE2_ENABLED: "true",
  PHASE2_REHEARSAL_MODE: "true",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "phase-2-seven-day-mvp",
  SPONSOR_PAYMENT_PROVIDER: "fixture",
  SPONSOR_FIXTURE_SECRET: "x".repeat(48),
};

describe("Phase 2 deployment policy", () => {
  it("enables only the approved Phase 2 and Phase 3 preview branches", () => {
    expect(phase2DeploymentAllowed(preview)).toBe(true);
    expect(phase2DeploymentAllowed({ ...preview, VERCEL_GIT_COMMIT_REF: "phase-3-launch-hardening" })).toBe(true);
    expect(phase2DeploymentAllowed({ ...preview, VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
  });

  it("refuses Phase 2 and fixture payments in Production", () => {
    const production = { ...preview, VERCEL_ENV: "production" };
    expect(phase2DeploymentAllowed(production)).toBe(false);
    expect(fixturePaymentsAllowed(production)).toBe(false);
  });

  it("requires a strong fixture secret", () => {
    expect(fixturePaymentsAllowed(preview)).toBe(true);
    expect(fixturePaymentsAllowed({ ...preview, SPONSOR_FIXTURE_SECRET: "short" })).toBe(false);
  });
});
