import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { brusselsCountryPackV1 } from "@/content/countries/brussels.v1";
import { renderPostcard } from "./render";

afterEach(() => vi.unstubAllGlobals());

describe("Brussels postcard", () => {
  it("loads its background from R2 when no image is checked into public", async () => {
    const background = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#aabbcc" } }).png().toBuffer();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(background, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await renderPostcard(brusselsCountryPackV1, { dayNumber: 2, contributionSeconds: 60 });
    expect(fetcher).toHaveBeenCalledWith(
      "https://assets.keephimwalking.com/scenes/brussels/v1/postcard.webp",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect((await sharp(result.image).metadata()).format).toBe("webp");
    expect((await sharp(result.openGraph).metadata()).width).toBe(1200);
  });
});
