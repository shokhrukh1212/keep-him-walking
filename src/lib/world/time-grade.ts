import type { VisualGrade } from "@/lib/world/visual-grade";

/**
 * The 02 §6 keyframes: local hour to colour grade. Values are display-space
 * multipliers, so Pixi's world filter and the character's material share them.
 */
const GRADE_KEYFRAMES: ReadonlyArray<{ hour: number; grade: VisualGrade }> = [
  { hour: 0, grade: { exposure: 0.62, tint: { r: 0.72, g: 0.80, b: 1.00 } } },
  { hour: 5, grade: { exposure: 0.80, tint: { r: 0.86, g: 0.92, b: 1.06 } } },
  { hour: 7, grade: { exposure: 1.00, tint: { r: 1.00, g: 1.00, b: 1.00 } } },
  { hour: 16, grade: { exposure: 1.00, tint: { r: 1.00, g: 1.00, b: 1.00 } } },
  { hour: 19, grade: { exposure: 1.02, tint: { r: 1.10, g: 0.98, b: 0.86 } } },
  { hour: 21, grade: { exposure: 0.62, tint: { r: 0.72, g: 0.80, b: 1.00 } } },
  { hour: 24, grade: { exposure: 0.62, tint: { r: 0.72, g: 0.80, b: 1.00 } } },
];

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Wraps any hour onto [0, 24). */
export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/** The city's local hour as a fraction, e.g. 13.87 for 13:52. */
export function localHourFraction(instant: Date, timeZone: string): number {
  if (!Number.isFinite(instant.getTime())) return 12;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return normalizeHour(value("hour") + value("minute") / 60 + value("second") / 3_600);
  } catch {
    // An unknown zone must not blank the world; fall back to UTC.
    return normalizeHour(
      instant.getUTCHours() + instant.getUTCMinutes() / 60 + instant.getUTCSeconds() / 3_600,
    );
  }
}

/** The colour grade for a local hour, interpolated between the keyframes. */
export function gradeForHour(hour: number): VisualGrade {
  const local = normalizeHour(hour);
  for (let index = 0; index < GRADE_KEYFRAMES.length - 1; index += 1) {
    const start = GRADE_KEYFRAMES[index]!;
    const end = GRADE_KEYFRAMES[index + 1]!;
    if (local < start.hour || local > end.hour) continue;
    const span = end.hour - start.hour;
    const t = span === 0 ? 0 : (local - start.hour) / span;
    return {
      exposure: lerp(start.grade.exposure, end.grade.exposure, t),
      tint: {
        r: lerp(start.grade.tint.r, end.grade.tint.r, t),
        g: lerp(start.grade.tint.g, end.grade.tint.g, t),
        b: lerp(start.grade.tint.b, end.grade.tint.b, t),
      },
    };
  }
  return GRADE_KEYFRAMES[0]!.grade;
}

/**
 * How much of the night painting is showing: 0 in daylight, 1 in deep night,
 * ramping across dusk (19–21) and dawn (05–07). Also drives the window lights.
 */
export function nightMix(hour: number): number {
  const local = normalizeHour(hour);
  if (local >= 21 || local < 5) return 1;
  if (local >= 19) return (local - 19) / 2;
  if (local < 7) return 1 - (local - 5) / 2;
  return 0;
}

/** Combines the hour's grade with a weather contrast factor. */
export function combineGrade(base: VisualGrade, contrastScale: number): VisualGrade {
  const scale = Number.isFinite(contrastScale) ? Math.max(0.1, contrastScale) : 1;
  return {
    exposure: base.exposure * scale,
    tint: { ...base.tint },
  };
}
