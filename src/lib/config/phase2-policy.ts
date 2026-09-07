export type DeploymentEnvironment = Record<string, string | undefined>;

export function phase2DeploymentAllowed(environment: DeploymentEnvironment = process.env): boolean {
  if (environment.PHASE2_ENABLED !== "true") return false;
  if (environment.VERCEL_ENV === "production") return false;
  if (environment.VERCEL_ENV === "preview") {
    return ["phase-2-seven-day-mvp", "phase-3-launch-hardening"].includes(environment.VERCEL_GIT_COMMIT_REF ?? "");
  }
  return environment.PHASE2_REHEARSAL_MODE === "true";
}

export function fixturePaymentsAllowed(environment: DeploymentEnvironment = process.env): boolean {
  return phase2DeploymentAllowed(environment)
    && environment.SPONSOR_PAYMENT_PROVIDER === "fixture"
    && environment.PHASE2_REHEARSAL_MODE === "true"
    && environment.VERCEL_ENV !== "production"
    && Boolean(environment.SPONSOR_FIXTURE_SECRET && environment.SPONSOR_FIXTURE_SECRET.length >= 32);
}
