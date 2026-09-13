import { chromium } from "@playwright/test";

const target = new URL(process.argv.find((argument) => /^https?:\/\//.test(argument)) ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1"].includes(target.hostname)) {
  throw new Error("Browser transfer report is restricted to a local production build");
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(target.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8_000);
  const rows = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => {
    const resource = entry;
    return {
      name: resource.name,
      bytes: resource.encodedBodySize || resource.transferSize || 0,
      type: resource.initiatorType,
    };
  }));
  const totals = rows.reduce((result, row) => {
    result.total += row.bytes;
    if (row.name.includes("assets.keephimwalking.com")) result.cdn += row.bytes;
    else result.app += row.bytes;
    return result;
  }, { total: 0, app: 0, cdn: 0 });
  process.stdout.write(`${JSON.stringify({ target: target.origin, viewport: "390x844", waitMs: 8000, resources: rows.length, encodedBytes: totals }, null, 2)}\n`);
} finally {
  await browser.close();
}
