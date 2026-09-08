"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { RouteZone, ZoneStage } from "@/lib/content/schema";
import { publicAssetUrl } from "@/lib/assets/url";
import { stageLayout, stageScaleWarning } from "@/lib/world/stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "@/lib/world/stage-targets";

type Field = "groundLineY" | "horizonY" | "personHeightFrac";

const viewportPresets = {
  desktop: {width: 1440, height: 900, label: "Desktop · 1440 × 900"},
  mobile: {width: 390, height: 844, label: "Mobile · 390 × 844"},
} as const;

/** A local editor only: copying is the sole output; no fetch, storage or mutation API. */
export function StageCalibration({ packId, zones, initialZoneId }: {
  packId: string;
  zones: RouteZone[];
  initialZoneId?: string;
}) {
  const [zoneId, setZoneId] = useState(initialZoneId ?? zones[0].id);
  const [viewportId, setViewportId] = useState<keyof typeof viewportPresets>("desktop");
  const [imageSize, setImageSize] = useState<{width: number; height: number} | null>(null);
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
  const viewport = viewportPresets[viewportId];
  const previewLayout = imageSize
    ? stageLayout(viewport.width, viewport.height, imageSize.width, imageSize.height, stage, CHARACTER_HEIGHT_TARGETS)
    : null;
  const warning = previewLayout ? stageScaleWarning(packId, zone.id, previewLayout) : null;
  return <section className="stage-calibration" aria-label="Stage calibration">
    <label>Zone <select aria-label="Zone" value={zone.id} onChange={(event) => {
      setZoneId(event.target.value);
      setImageSize(null);
      setCopied(false);
    }}>
      {zones.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <p>Drag the ground and horizon lines. Drag the figure’s head to match an adult beside a doorway.
      Arrow keys adjust a focused handle. Changes stay in this tab; copy the JSON into the pack.</p>
    <div className="calibration-art" ref={surface}>
      {/* Keep the full image visible so handles measure image fractions, not viewport fractions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={publicAssetUrl(zone.fallbackUrl)} crossOrigin="anonymous" alt={`${zone.label} calibration panorama`}
        onLoad={(event) => setImageSize({width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight})}
        draggable={false} />
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
    <div className="calibration-preview-controls">
      <label>Rendered viewport <select aria-label="Rendered viewport" value={viewportId}
        onChange={(event) => setViewportId(event.target.value as keyof typeof viewportPresets)}>
        {Object.entries(viewportPresets).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
      </select></label>
      {previewLayout ? <dl className="calibration-readouts" aria-label="Scale readouts">
        <div><dt>personHeightFrac</dt><dd>{stage.personHeightFrac.toFixed(3)}</dd></div>
        <div><dt>imageScale</dt><dd>{previewLayout.imageScale.toFixed(3)}</dd></div>
        <div><dt>Resulting character</dt><dd>{previewLayout.personHeightPx.toFixed(1)} px</dd></div>
        <div><dt>Relative to width fit</dt><dd>{previewLayout.characterImageScale.toFixed(3)}×</dd></div>
      </dl> : <p>Loading scale readouts…</p>}
    </div>
    {warning ? <p className="calibration-warning" role="alert">{warning}</p> : null}
    <div className="calibration-viewport" data-testid="calibration-viewport"
      style={{aspectRatio: `${viewport.width} / ${viewport.height}`,
        background: `linear-gradient(to bottom, ${zone.lighting.skyTop} 0 ${viewport.width <= 600 ? 80 : 86}%, ${stage.palette[0]} ${viewport.width <= 600 ? 80 : 86}% 100%)`}}>
      {previewLayout && imageSize ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicAssetUrl(zone.fallbackUrl)} crossOrigin="anonymous" alt="" aria-hidden="true" draggable={false}
          style={{width: `${imageSize.width * previewLayout.imageScale / viewport.width * 100}%`,
            height: `${imageSize.height * previewLayout.imageScale / viewport.height * 100}%`,
            left: `${previewLayout.imageX / viewport.width * 100}%`,
            top: `${previewLayout.imageY / viewport.height * 100}%`}} />
        <div className="calibration-target-character" aria-label={`${previewLayout.personHeightPx.toFixed(1)} pixel target character`}
          style={{height: `${previewLayout.personHeightPx / viewport.height * 100}%`,
            bottom: `${(viewport.height - previewLayout.groundY) / viewport.height * 100}%`}}>1.78 m</div>
      </> : null}
    </div>
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(json); setCopied(true); }
      catch { setCopied(false); }
    }}>Copy stage JSON</button>
    <span role="status">{copied ? "Copied." : "JSON is also selectable below."}</span>
    <pre data-testid="stage-json">{json}</pre>
  </section>;
}
