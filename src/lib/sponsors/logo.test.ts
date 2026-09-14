import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SPONSOR_LOGO_MAX_BYTES, prepareSponsorLogo } from "./logo";

function image(width: number, height: number, format: "png" | "jpeg" | "gif") {
  const base = sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } });
  return (format === "png" ? base.png() : format === "jpeg" ? base.jpeg() : base.gif()).toBuffer();
}

describe("prepareSponsorLogo", () => {
  it("re-encodes an accepted logo as a bounded still WebP", async () => {
    const result = await prepareSponsorLogo(await image(1_200, 600, "png"));
    const metadata = await sharp(result.webp).metadata();
    expect(metadata.format).toBe("webp");
    expect([result.width, result.height]).toEqual([512, 256]);
  });

  it("keeps a small logo at its own size", async () => {
    const result = await prepareSponsorLogo(await image(200, 200, "jpeg"));
    expect([result.width, result.height]).toEqual([200, 200]);
  });

  it("decides the type from the content, refusing SVG, GIF and non-images", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
    await expect(prepareSponsorLogo(svg)).rejects.toThrow("LOGO_TYPE");
    await expect(prepareSponsorLogo(await image(100, 100, "gif"))).rejects.toThrow("LOGO_TYPE");
    await expect(prepareSponsorLogo(Buffer.from("not an image at all"))).rejects.toThrow("LOGO_TYPE");
  });

  it("refuses empty, oversized and too-small files", async () => {
    await expect(prepareSponsorLogo(new Uint8Array())).rejects.toThrow("LOGO_SIZE");
    await expect(prepareSponsorLogo(new Uint8Array(SPONSOR_LOGO_MAX_BYTES + 1))).rejects.toThrow("LOGO_SIZE");
    await expect(prepareSponsorLogo(await image(32, 32, "png"))).rejects.toThrow("LOGO_DIMENSIONS");
  });
});
