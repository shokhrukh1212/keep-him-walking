import type { QualityTier } from "./types";

type DeviceSignals = {
  width: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  reducedMotion?: boolean;
  override?: QualityTier;
};

export function chooseQualityTier(signals: DeviceSignals): QualityTier {
  if (signals.override) return signals.override;
  const constrained =
    signals.reducedMotion ||
    signals.width <= 420 ||
    (signals.hardwareConcurrency ?? 8) <= 4 ||
    (signals.deviceMemory ?? 8) <= 4;
  if (constrained) return "low";
  if (signals.width < 1_100 || signals.devicePixelRatio > 2) return "medium";
  return "high";
}

export const QUALITY_LIMITS: Record<QualityTier, {
  resolution: number;
  maxProps: number;
  motes: number;
  targetFps: number;
}> = {
  low: { resolution: 1, maxProps: 10, motes: 0, targetFps: 30 },
  medium: { resolution: 1.25, maxProps: 16, motes: 14, targetFps: 50 },
  high: { resolution: 1.6, maxProps: 24, motes: 22, targetFps: 60 },
};
