"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  BootstrapSnapshot,
  ConnectionStatus,
  HeartbeatResponse,
} from "@/lib/contracts";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Props = {
  snapshot: BootstrapSnapshot;
  sceneReady: boolean;
  onHeartbeat: (heartbeat: HeartbeatResponse) => void;
  onReactionHint?: () => void;
};

export function useJourneyPresence({ snapshot, sceneReady, onHeartbeat, onReactionHint }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(snapshot.presence.status);
  const sessionId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const requestInFlight = useRef(false);
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

  const heartbeat = useCallback(async (forceInactive = false) => {
    const current = snapshotRef.current;
    if (current.mode !== "live" || !sceneReady || !sessionId.current) return;
    if (requestInFlight.current && !forceInactive) return;
    if (forceInactive) requestController.current?.abort();
    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    requestInFlight.current = true;
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
      if (!forceInactive) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
          () => void heartbeatRef.current(),
          result.nextHeartbeatInMs,
        );
      }
    } catch {
      if (requestGeneration !== generation.current) return;
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      if (!forceInactive) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void heartbeatRef.current(), 5_000);
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === generation.current) requestInFlight.current = false;
    }
  }, [sceneReady]);

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
    const onOnline = () => { requestController.current?.abort(); generation.current++; requestInFlight.current=false; void heartbeat(); };
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      requestController.current?.abort();
      requestInFlight.current=false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      window.clearTimeout(initialHeartbeat);
      if (timer.current) window.clearTimeout(timer.current);
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
