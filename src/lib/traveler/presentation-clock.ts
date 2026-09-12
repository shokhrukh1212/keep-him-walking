import type { RouteRuntime } from "@/lib/world/types";
import type { ScheduledActionView } from "@/lib/contracts";
import { activityWindow } from "@/lib/world/activities";
import { projectedRouteDistance } from "@/lib/world/route-clock";

/** Two monotonic tracks shared by the scene and rig. Network updates change targets, not origins. */
export class PresentationClock {
  private seconds = 0;
  private distance = 0;
  private lastTick = 0;
  private secondsAnchor = 0;
  private distanceAnchor = 0;
  private paceRate = 1;
  private receivedAt = 0;
  private stamp = -Infinity;
  private walking = false;
  private expiry = 0;
  private initialized = false;
  accept(runtime: RouteRuntime, ttlMs: number, now = performance.now()) {
    const stamp = Date.parse(runtime.authoritativeAt);
    if (!Number.isFinite(stamp) || stamp < this.stamp) return;
    const leaseMs = Math.min(60_000, Math.max(0, ttlMs));
    if (stamp === this.stamp && this.initialized) {
      // Presence heartbeats often repeat an unchanged route authority timestamp.
      // They still renew the confirmed walking lease; resetting receivedAt here
      // would rewind the presentation target to the old anchor.
      this.expiry = now + leaseMs;
      return;
    }
    this.stamp = stamp;
    this.secondsAnchor = runtime.globalActiveSeconds;
    this.distanceAnchor = runtime.globalDistanceMetres;
    this.paceRate = runtime.paceRate;
    this.receivedAt = now;
    this.walking = runtime.walking;
    // Lease lifetime and presentation authority are separate. Even a future
    // adaptive lease may never authorize more than sixty seconds of invention.
    this.expiry = now + leaseMs;
    if (!this.initialized) {
      this.seconds = this.secondsAnchor;
      this.distance = this.distanceAnchor;
      this.lastTick = now;
      this.initialized = true;
    }
  }
  sample(now = performance.now(), scheduledActions: readonly ScheduledActionView[] = []) {
    const dt = Math.max(0, Math.min(0.1, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const valid = this.walking && now < this.expiry;
    const elapsed = this.walking
      ? Math.max(0, (Math.min(now, this.expiry) - this.receivedAt) / 1_000)
      : 0;
    const secondsTarget = this.secondsAnchor + elapsed;
    const distanceRate = 1.25 * this.paceRate;
    const distanceTarget = projectedRouteDistance({
      globalActiveSeconds: this.secondsAnchor,
      globalDistanceMetres: this.distanceAnchor,
      paceRate: this.paceRate,
      authoritativeAt: new Date(0).toISOString(),
      walking: this.walking,
    }, elapsed, scheduledActions);
    const actionActive = scheduledActions.some((action) => {
      const window = activityWindow(action);
      return window !== null && secondsTarget >= window[0] && secondsTarget < window[1];
    });
    const secondsDifference = secondsTarget - this.seconds;
    const distanceDifference = distanceTarget - this.distance;
    if (Math.abs(secondsDifference) > 2 || !valid) this.seconds = secondsTarget;
    else this.seconds += dt * Math.max(0, Math.min(1.05, 1 + secondsDifference * 0.1));
    if (actionActive || Math.abs(distanceDifference) > 2 * distanceRate || !valid) this.distance = distanceTarget;
    else this.distance += dt * distanceRate * Math.max(
      0,
      Math.min(1.05, 1 + distanceDifference / Math.max(1, distanceRate) * 0.1),
    );
    return { rawSeconds: this.seconds, distanceMetres: this.distance, traveling: valid };
  }
}
