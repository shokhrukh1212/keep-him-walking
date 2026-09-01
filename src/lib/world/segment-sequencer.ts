import { deterministicVariant } from "./route-clock";

export function segmentVariant(
  zoneId: string,
  segmentIndex: number,
  layerIndex: number,
  variantCount: number,
): number {
  if (variantCount <= 1) return 0;
  const offset = deterministicVariant(zoneId, 0, variantCount ** 3);
  const signatureIndex = Math.abs(segmentIndex + offset);
  return Math.floor(signatureIndex / variantCount ** layerIndex) % variantCount;
}

export function composedSegmentSignature(
  zoneId: string,
  segmentIndex: number,
  layerVariantCounts: number[],
): string {
  let variableLayerIndex = 0;
  return layerVariantCounts.map((count) => {
    const variant = segmentVariant(zoneId, segmentIndex, variableLayerIndex, count);
    if (count > 1) variableLayerIndex += 1;
    return variant;
  }).join(":");
}
