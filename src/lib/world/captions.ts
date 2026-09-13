import type { DialogueLine } from "@/lib/content/schema";

const DEFAULT_SECONDS = 4.5;
const MAX_CUE_CHARACTERS = 84;

/** Split authored dialogue at word boundaries; every source word remains visible. */
export function captionCues(text: string, maxCharacters = MAX_CUE_CHARACTERS): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const cues: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxCharacters) {
      cues.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) cues.push(current);
  return cues;
}

/** Long lines receive enough timeline time to show each cue at a readable pace. */
export function readableLineSeconds(line: DialogueLine): number {
  const authored = (line.durationMs ?? DEFAULT_SECONDS * 1_000) / 1_000;
  const readingTime = line.text.trim().length / 15 + 0.8;
  return Math.max(authored, readingTime);
}

/** A deterministic cue derived only from the current authored line and timeline offset. */
export function captionCueAt(line: DialogueLine, elapsedSeconds: number): string {
  const cues = captionCues(line.text);
  if (cues.length <= 1) return cues[0] ?? "";
  const progress = Math.min(0.999999, Math.max(0, elapsedSeconds) / readableLineSeconds(line));
  return cues[Math.floor(progress * cues.length)] ?? cues[cues.length - 1]!;
}
