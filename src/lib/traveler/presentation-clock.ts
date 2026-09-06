import type { RouteRuntime } from "@/lib/world/types";

/** One monotonic clock shared by the scene and rig. Network updates change its target, not its origin. */
export class PresentationClock {
  private value = 0;
  private lastTick = 0;
  private anchor = 0;
  private receivedAt = 0;
  private stamp = -Infinity;
  private walking = false;
  private expiry = 0;
  private initialized = false;
  accept(runtime: RouteRuntime, ttlMs: number, now = performance.now()) {
    const stamp = Date.parse(runtime.authoritativeAt);
    if (!Number.isFinite(stamp) || stamp <= this.stamp) return;
    this.stamp = stamp;
    this.anchor = runtime.globalActiveSeconds;
    this.receivedAt = now;
    this.walking = runtime.walking;
    this.expiry = now + ttlMs;
    if (!this.initialized) { this.value = this.anchor; this.lastTick = now; this.initialized = true; }
  }
  sample(now = performance.now()) {
    const dt = Math.max(0, Math.min(0.1, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const valid = this.walking && now < this.expiry;
    const target = this.anchor + (this.walking ? Math.max(0, (Math.min(now, this.expiry) - this.receivedAt) / 1000) : 0);
    const difference = target - this.value;
    if (Math.abs(difference) > 2 || !valid) this.value = target;
    else this.value += dt * Math.max(0, Math.min(1.05, 1 + difference * 0.1));
    return { rawSeconds: this.value, traveling: valid };
  }
}
