export function publicLaunchEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.LAUNCH_ENABLED === "true";
}
