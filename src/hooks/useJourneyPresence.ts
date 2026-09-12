"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  BootstrapSnapshot,
  ConnectionStatus,
  HeartbeatResponse,
} from "@/lib/contracts";
import { heartbeatRecoveryDecision } from "@/lib/presence/heartbeat-recovery";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Props = {
  snapshot: BootstrapSnapshot;
  sceneReady: boolean;
  onHeartbeat: (heartbeat: HeartbeatResponse) => void;
  onReactionHint?: () => void;
};

/** How often the watchdog checks that a heartbeat is either on the wire or due. */
const WATCHDOG_INTERVAL_MS = 2_000;

export function useJourneyPresence({ snapshot, sceneReady, onHeartbeat, onReactionHint }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(snapshot.presence.status);
  const sessionId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const nextDueAt = useRef<number | null>(null);
  const requestInFlight = useRef(false);
  const inFlightSince = useRef<number | null>(null);
  // A beat asked for while another was on the wire. Dropping it silently is how a
  // viewer who is still watching used to lose their lease.
  const pendingKick = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const heartbeatRef = useRef<(forceInactive?: boolean) => Promise<void>>(async () => undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reactionHintRef = useRef(onReactionHint);
  const onHeartbeatRef = useRef(onHeartbeat);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    reactionHintRef.current = onReactionHint;
    onHeartbeatRef.current = onHeartbeat;
    snapshotRef.current = snapshot;
  }, [onHeartbeat, onReactionHint, snapshot]);

  const broadcastReactionHint = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "reaction", payload: {} });
  }, []);

  const schedule = useCallback((delayMs: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    nextDueAt.current = Date.now() + delayMs;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      nextDueAt.current = null;
      void heartbeatRef.current();
    }, delayMs);
  }, []);

  const heartbeat = useCallback(async (forceInactive = false) => {
    const current = snapshotRef.current;
    if (current.mode !== "live" || !sceneReady || !sessionId.current) return;
    if (requestInFlight.current && !forceInactive) {
      pendingKick.current = true;
      return;
    }
    if (forceInactive) requestController.current?.abort();
    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    requestInFlight.current = true;
    inFlightSince.current = Date.now();
    const active = !forceInactive && document.visibilityState === "visible" && navigator.onLine;
    try {
      const response = await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          state: active ? "active" : "inactive",
          sceneReady,
        }),
        keepalive: forceInactive,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Presence update failed");
      const result = (await response.json()) as HeartbeatResponse;
      if (requestGeneration !== generation.current) return;
      if (result.countryDayId && result.countryDayId !== current.countryDay.id) {
        throw new Error("Country changed during heartbeat");
      }
      if (!Number.isFinite(result.activeViewers) || typeof result.walking !== "boolean"
        || !Number.isFinite(result.globalActiveSeconds)
        || !Number.isFinite(result.globalDistanceMetres)
        || !Number.isFinite(result.paceRate)
        || !Number.isFinite(Date.parse(result.routeAuthoritativeAt))
        || (result.waitingSince !== undefined && result.waitingSince !== null
          && !Number.isFinite(Date.parse(result.waitingSince)))
        || (result.wokeHim !== undefined && typeof result.wokeHim !== "boolean")) {
        throw new Error("Invalid presence confirmation");
      }
      // Keep the last server-confirmed bootstrap values during a rolling deploy
      // where an older heartbeat route may not yet return the newer optional
      // presentation fields. Presence/progress still come only from this
      // heartbeat; nothing is invented in the browser.
      onHeartbeatRef.current({
        ...result,
        realServerNow: result.realServerNow ?? result.serverNow,
        waitingSince: result.waitingSince ?? null,
        wokeHim: result.wokeHim ?? false,
        countryCode: result.countryCode ?? current.countryDay.countryCode,
        reactions: result.reactions ?? current.reactions,
        weather: result.weather ?? current.weather,
      });
      setStatus("live");
      if (!forceInactive) schedule(result.nextHeartbeatInMs);
    } catch {
      if (requestGeneration !== generation.current) return;
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      if (!forceInactive) schedule(5_000);
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === generation.current) {
        requestInFlight.current = false;
        inFlightSince.current = null;
        // Someone asked for a beat while this one was on the wire. It only matters
        // when the answer changed: a goodbye that finished after the viewer came
        // back must be corrected now, not at the next scheduled beat.
        const wantsActive = document.visibilityState === "visible" && navigator.onLine;
        if (pendingKick.current && wantsActive !== active) schedule(0);
        pendingKick.current = false;
      }
    }
  }, [schedule, sceneReady]);

  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    if (snapshot.mode !== "live" || !sceneReady) return;
    sessionId.current ??= crypto.randomUUID();
    const supabase = getBrowserSupabase();
    const channel = supabase?.channel(`journey:${snapshot.countryDay.id}`, {
      config: {
        presence: { key: sessionId.current },
        broadcast: { self: false },
      },
    });
    channelRef.current = channel ?? null;
    const trackRealtimePresence = async () => {
      if (!channel) return;
      if (document.visibilityState === "visible") {
        await channel.track({ scene_ready: true, joined_at: new Date().toISOString() });
      } else {
        await channel.untrack();
      }
    };
    const onVisibility = () => {
      void trackRealtimePresence();
      void heartbeat(document.visibilityState !== "visible");
    };
    const onOnline = () => { requestController.current?.abort(); generation.current++; requestInFlight.current=false; inFlightSince.current=null; void heartbeat(); };
    const onOffline = () => {
      setStatus("offline");
      // Offline is unknown presence, not an inactive session confirmation.
    };
    const onPageHide = () => void heartbeat(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);
    const initialHeartbeat = window.setTimeout(() => void heartbeatRef.current(), 0);

    // One watchdog restarts a chain that lost its timer or hangs on a request the
    // browser never settled. It only ever acts for a visible, online, ready viewer.
    const watchdog = window.setInterval(() => {
      const decision = heartbeatRecoveryDecision({
        live: snapshotRef.current.mode === "live",
        sceneReady,
        visible: document.visibilityState === "visible",
        online: navigator.onLine,
        inFlightSinceMs: requestInFlight.current ? inFlightSince.current : null,
        nextDueMs: nextDueAt.current,
      }, Date.now());
      if (decision === "none") return;
      if (decision === "abort_and_send") {
        requestController.current?.abort();
        generation.current += 1;
        requestInFlight.current = false;
        inFlightSince.current = null;
      }
      void heartbeatRef.current();
    }, WATCHDOG_INTERVAL_MS);

    let reconciliationTimer: number | null = null;
    const reconcile = () => {
      if (reconciliationTimer) window.clearTimeout(reconciliationTimer);
      reconciliationTimer = window.setTimeout(() => void heartbeat(), 350);
    };
    channel
      ?.on("presence", { event: "sync" }, reconcile)
      .on("presence", { event: "join" }, reconcile)
      .on("presence", { event: "leave" }, reconcile)
      .on("broadcast", { event: "reaction" }, () => reactionHintRef.current?.())
      .subscribe(async (channelStatus) => {
        if (channelStatus === "SUBSCRIBED") await trackRealtimePresence();
      });

    return () => {
      // This is a request-generation counter, intentionally invalidated at cleanup.
      generation.current++;
      requestController.current?.abort();
      requestInFlight.current=false;
      inFlightSince.current = null;
      pendingKick.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      window.clearTimeout(initialHeartbeat);
      window.clearInterval(watchdog);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      nextDueAt.current = null;
      if (reconciliationTimer) window.clearTimeout(reconciliationTimer);
      if (channel && supabase) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [heartbeat, sceneReady, snapshot.countryDay.id, snapshot.mode]);

  return {
    status: snapshot.mode === "offline_preview" || snapshot.mode === "prelaunch"
      ? snapshot.presence.status
      : status,
    broadcastReactionHint,
  };
}
