"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { RouteZone, ZoneStage } from "@/lib/content/schema";
import { publicAssetUrl } from "@/lib/assets/url";

type Field = "groundLineY" | "horizonY" | "personHeightFrac";

/** A local editor only: copying is the sole output; no fetch, storage or mutation API. */
export function StageCalibration({ zones, initialZoneId }: { zones: RouteZone[]; initialZoneId?: string }) {
  const [zoneId, setZoneId] = useState(initialZoneId ?? zones[0].id);
  const zone = zones.find((candidate) => candidate.id === zoneId) ?? zones[0];
  const [drafts, setDrafts] = useState<Record<string, ZoneStage>>({});
  const [copied, setCopied] = useState(false);
  const stage = drafts[zone.id] ?? zone.stage;
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ field: Field; top: number; height: number; ground: number } | null>(null);

  const change = (field: Field, value: number) => {
    const bounded = Math.round(Math.min(1, Math.max(field === "personHeightFrac" ? 0.01 : 0, value)) * 1000) / 1000;
    setDrafts((current) => ({ ...current, [zone.id]: { ...(current[zone.id] ?? zone.stage), [field]: bounded } }));
    setCopied(false);
  };
  const start = (event: PointerEvent<HTMLButtonElement>, field: Field) => {
    const bounds = surface.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { field, top: bounds.top, height: bounds.height, ground: stage.groundLineY };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const { field, top, height, ground } = drag.current;
    const y = (event.clientY - top) / height;
    change(field, field === "personHeightFrac" ? ground - y : y);
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>, field: Field) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    change(field, stage[field] + direction * (field === "personHeightFrac" ? -0.005 : 0.005));
  };
  const stop = () => { drag.current = null; };
  const json = JSON.stringify({ stage }, null, 2);
  return <section className="stage-calibration" aria-label="Stage calibration">
    <label>Zone <select value={zone.id} onChange={(event) => { setZoneId(event.target.value); setCopied(false); }}>
      {zones.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <p>Drag the ground and horizon lines. Drag the figure’s head to match an adult beside a doorway.
      Arrow keys adjust a focused handle. Changes stay in this tab; copy the JSON into the pack.</p>
    <div className="calibration-art" ref={surface}>
      {/* Keep the full image visible so handles measure image fractions, not viewport fractions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={publicAssetUrl(zone.fallbackUrl)} crossOrigin="anonymous" alt={`${zone.label} calibration panorama`} draggable={false} />
      <button type="button" className="calibration-line calibration-ground" style={{ top: `${stage.groundLineY * 100}%` }}
        aria-label="Drag ground line" onPointerDown={(event) => start(event, "groundLineY")} onPointerMove={move}
        onPointerUp={stop} onPointerCancel={stop} onKeyDown={(event) => key(event, "groundLineY")}>Ground · {stage.groundLineY}</button>
      <button type="button" className="calibration-line calibration-horizon" style={{ top: `${stage.horizonY * 100}%` }}
        aria-label="Drag horizon line" onPointerDown={(event) => start(event, "horizonY")} onPointerMove={move}
        onPointerUp={stop} onPointerCancel={stop} onKeyDown={(event) => key(event, "horizonY")}>Horizon · {stage.horizonY}</button>
      <svg className="calibration-person" viewBox="0 0 60 178" preserveAspectRatio="none" aria-hidden="true"
        style={{ top: `${(stage.groundLineY - stage.personHeightFrac) * 100}%`, height: `${stage.personHeightFrac * 100}%` }}>
        <circle cx="30" cy="13" r="11" /><path d="M30 24 V100 M30 44 L4 85 M30 44 L56 85 M30 100 L12 177 M30 100 L48 177" />
      </svg>
      <button type="button" className="calibration-height" style={{ top: `${(stage.groundLineY - stage.personHeightFrac) * 100}%` }}
        aria-label="Drag person height" onPointerDown={(event) => start(event, "personHeightFrac")} onPointerMove={move}
        onPointerUp={stop} onPointerCancel={stop} onKeyDown={(event) => key(event, "personHeightFrac")}>↕ 1.78 m · {stage.personHeightFrac}</button>
    </div>
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(json); setCopied(true); }
      catch { setCopied(false); }
    }}>Copy stage JSON</button>
    <span role="status">{copied ? "Copied." : "JSON is also selectable below."}</span>
    <pre data-testid="stage-json">{json}</pre>
  </section>;
}
