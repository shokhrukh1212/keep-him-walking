export function launchCountdown(launchAtMs: number, nowMs: number): string {
  if (!Number.isFinite(launchAtMs) || !Number.isFinite(nowMs)) return "soon";
  const seconds = Math.max(0, Math.ceil((launchAtMs - nowMs) / 1_000));
  if (seconds === 0) return "now";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  if (minutes > 0) return `in ${minutes}m ${remainder}s`;
  return `in ${remainder}s`;
}
