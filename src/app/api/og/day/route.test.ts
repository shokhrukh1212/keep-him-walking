import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/og/day before launch", () => {
  it("serves the supplied 1200 by 630 brand card without live-day data", async () => {
    vi.stubEnv("LAUNCH_ENABLED", "false");
    const response = await GET();
    const image = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(image.buffer, image.byteOffset, image.byteLength);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
  });
});
