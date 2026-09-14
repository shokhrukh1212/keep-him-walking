import { phase2DeploymentAllowed, type DeploymentEnvironment } from "@/lib/config/phase2-policy";

export function publicLaunchEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.LAUNCH_ENABLED === "true";
}

/**
 * Production whose launch switch is deliberately off: the owner's intentional
 * prelaunch, never an outage. There is no live day to show and nothing is guessed.
 */
export function launchSwitchedOff(environment: DeploymentEnvironment = process.env): boolean {
  return environment.VERCEL_ENV === "production" && !phase2DeploymentAllowed(environment);
}
