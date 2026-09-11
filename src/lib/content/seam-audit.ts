/** Mean normalized colour difference between matching strips at both image edges. */
export function horizontalEdgeMismatch(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
  stripWidth = 4,
): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(channels)
    || width < stripWidth * 2 || height < 1 || channels < 1
    || pixels.length < width * height * channels) {
    throw new Error("Invalid image buffer for seam audit");
  }
  let difference = 0;
  let samples = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < stripWidth; x += 1) {
      for (let channel = 0; channel < Math.min(channels, 3); channel += 1) {
        const left = (y * width + x) * channels + channel;
        const right = (y * width + width - stripWidth + x) * channels + channel;
        difference += Math.abs(pixels[left]! - pixels[right]!);
        samples += 1;
      }
    }
  }
  return samples === 0 ? 1 : difference / (samples * 255);
}
