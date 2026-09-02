"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
};

export function useJourneyPresence({ snapshot, sceneReady, onHeartbeat }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(snapshot.presence.status);
  const sessionId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const requestInFlight = useRef(false);
  const heartbeatRef = useRef<(forceInactive?: boolean) => Promise<void>>(async () => undefined);

  const heartbeat = useCallback(async (forceInactive = false) => {
    if (snapshot.mode !== "live" || !sceneReady || !sessionId.current) return;
    if (requestInFlight.current && !forceInactive) return;
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
      });
      if (!response.ok) throw new Error("Presence update failed");
      const result = (await response.json()) as HeartbeatResponse;
      onHeartbeat(result);
      setStatus("live");
      if (!forceInactive) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
          () => void heartbeatRef.current(),
          result.nextHeartbeatInMs,
        );
      }
    } catch {
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      if (!forceInactive) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void heartbeatRef.current(), 5_000);
      }
    } finally {
      requestInFlight.current = false;
    }
  }, [onHeartbeat, sceneReady, snapshot.mode]);

  useEffect(() => {
    heartbeatRef.current = heartbeat;
  }, [heartbeat]);

  useEffect(() => {
    if (snapshot.mode !== "live" || !sceneReady) return;
    sessionId.current ??= crypto.randomUUID();
    const supabase = getBrowserSupabase();
    const channel = supabase?.channel(`journey:${snapshot.countryDay.id}`, {
      config: { presence: { key: sessionId.current } },
    });
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
    const onOnline = () => void heartbeat();
    const onOffline = () => {
      setStatus("offline");
      void heartbeat(true);
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
      .subscribe(async (channelStatus) => {
        if (channelStatus === "SUBSCRIBED") await trackRealtimePresence();
      });

    return () => {
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
    };
  }, [heartbeat, sceneReady, snapshot.countryDay.id, snapshot.mode]);

  return snapshot.mode === "offline_preview" ? snapshot.presence.status : status;
}
