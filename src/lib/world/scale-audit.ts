import type { ZoneStage } from "../content/schema";
import { MAX_STAGE_IMAGE_SCALE, stageLayout } from "./stage-layout";
import { targetCharacterHeightPx, type CharacterHeightTargets } from "./stage-targets";

export const SCALE_SANITY_VIEWPORTS = [
  {width: 320, height: 568},
  {width: 390, height: 844},
  {width: 768, height: 1024},
  {width: 1440, height: 900},
  {width: 2560, height: 1080},
] as const;

export type ScaleAuditRow = {
  city: string;
  packId: string;
  zoneId: string;
  personHeightFrac: number;
  requiredImageScale: number;
  characterPx: number;
  needsRegeneration: boolean;
  sanityErrors: string[];
};

export function assertCharacterScaleWithinTolerance(
  renderedPx: number,
  targetPx: number,
  context: string,
) {
  const ratio = renderedPx / targetPx;
  if (!Number.isFinite(ratio) || ratio > MAX_STAGE_IMAGE_SCALE || ratio < 1 / MAX_STAGE_IMAGE_SCALE) {
    throw new Error(`${context}: character is ${(ratio || 0).toFixed(3)}× the viewport target`);
  }
}

export function auditZoneScale(
  city: string,
  packId: string,
  zoneId: string,
  imageW: number,
  imageH: number,
  stage: ZoneStage,
  targets: CharacterHeightTargets,
): ScaleAuditRow {
  const sanityErrors: string[] = [];
  for (const viewport of SCALE_SANITY_VIEWPORTS) {
    const layout = stageLayout(viewport.width, viewport.height, imageW, imageH, stage, targets);
    const artworkCharacterPx = stage.personHeightFrac * imageH * layout.imageScale;
    try {
      assertCharacterScaleWithinTolerance(
        artworkCharacterPx,
        targetCharacterHeightPx(viewport.width, viewport.height, targets),
        `${packId}/${zoneId} at ${viewport.width}px`,
      );
    } catch (error) {
      sanityErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const reference = stageLayout(1440, 900, imageW, imageH, stage, targets);
  return {
    city,
    packId,
    zoneId,
    personHeightFrac: stage.personHeightFrac,
    requiredImageScale: reference.requiredImageScale,
    characterPx: reference.personHeightPx,
    needsRegeneration: reference.requiredImageScale > MAX_STAGE_IMAGE_SCALE,
    sanityErrors,
  };
}

export function formatScaleAudit(rows: ScaleAuditRow[], generatedOn: string) {
  const totalNeedsRegeneration = rows.filter((row) => row.needsRegeneration).length;
  const grouped = new Map<string, ScaleAuditRow[]>();
  for (const row of rows) grouped.set(row.city, [...(grouped.get(row.city) ?? []), row]);
  const groups = [...grouped.entries()].map(([city, cityRows]) => ({
    city,
    rows: [...cityRows].sort((a, b) => b.requiredImageScale - a.requiredImageScale
      || a.packId.localeCompare(b.packId) || a.zoneId.localeCompare(b.zoneId)),
  })).sort((a, b) => b.rows[0].requiredImageScale - a.rows[0].requiredImageScale
    || a.city.localeCompare(b.city));

  const lines = [
    "# Character scale audit",
    "",
    `Generated ${generatedOn} at the 1440×900 reference viewport using the configured desktop target.`,
    "The required image scale is measured before the 1.6 clamp.",
    "",
    `**Total:** ${rows.length} registered zones; **NEEDS REGENERATION:** ${totalNeedsRegeneration}.`,
    "",
  ];
  for (const group of groups) {
    lines.push(`## ${group.city}`, "", "| Pack / zone | personHeightFrac | Required imageScale | Character px | Result | Artwork sanity |", "|---|---:|---:|---:|---|---|");
    for (const row of group.rows) {
      lines.push(`| ${row.packId} / ${row.zoneId} | ${row.personHeightFrac.toFixed(3)} | ${row.requiredImageScale.toFixed(3)} | ${row.characterPx.toFixed(1)} | ${row.needsRegeneration ? "NEEDS REGENERATION" : "OK"} | ${row.sanityErrors.length ? `ERROR (${row.sanityErrors.length} viewports)` : "PASS"} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
