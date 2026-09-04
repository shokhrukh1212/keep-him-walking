import { randomUUID } from "node:crypto";

function argument(name: string) { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] ?? null : null; }
const execute = process.argv.includes("--execute");
const baseUrl = argument("base-url");
const watchers = Number(argument("watchers") ?? "1000");
const durationSeconds = Number(argument("duration") ?? "60");
const expectedHost = argument("confirm-host");
const sponsorId = argument("sponsor-id");
if (!Number.isInteger(watchers) || watchers < 1 || watchers > 1_000) throw new Error("--watchers must be 1..1000");
if (!Number.isFinite(durationSeconds) || durationSeconds < 10 || durationSeconds > 600) throw new Error("--duration must be 10..600 seconds");
const plan = { target: "1000 concurrent watchers", watchers, durationSeconds, scenarios: ["bootstrap", "presence", "vote-validation", "postcard-validation", "sponsor-redirect-if-configured"], budgets: { p95Ms: 800, errorRate: 0.01 }, mutatesState: execute };
if (!execute) { process.stdout.write(`${JSON.stringify({ dryRun: true, ...plan }, null, 2)}\n`); process.exit(0); }
if (!baseUrl || !expectedHost) throw new Error("Execution requires --base-url and --confirm-host");
const target = new URL(baseUrl);
if (target.hostname !== expectedHost || !/(vercel\.app|localhost)$/.test(target.hostname) || target.hostname === new URL(process.env.PRODUCTION_APP_URL || "https://invalid.local").hostname) throw new Error("Refusing unconfirmed or Production load target");

const latencies: number[] = [];
let requests = 0; let errors = 0;
const deadline = Date.now() + durationSeconds * 1_000;
async function measured(url: URL, init?: RequestInit) {
  const started = performance.now();
  try {
    const response = await fetch(url, init);
    requests += 1;
    if (response.status >= 500 || response.status === 429) errors += 1;
    return response;
  } catch { requests += 1; errors += 1; return null; }
  finally { latencies.push(performance.now() - started); }
}
async function watcher() {
  const sessionId = randomUUID();
  while (Date.now() < deadline) {
    const bootstrap = await measured(new URL("/api/bootstrap", target), { cache: "no-store" });
    const cookie = bootstrap?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const headers = { "Content-Type": "application/json", Origin: target.origin, ...(cookie ? { Cookie: cookie } : {}) };
    await measured(new URL("/api/presence/heartbeat", target), { method: "POST", headers, body: JSON.stringify({ sessionId, state: "visible", sceneReady: true }) });
    await measured(new URL("/api/votes", target), { method: "POST", headers, body: "{}" });
    await measured(new URL("/api/postcards", target), { method: "POST", headers, body: "{}" });
    if (sponsorId) await measured(new URL(`/r/sponsor/${encodeURIComponent(sponsorId)}`, target), { redirect: "manual", headers: cookie ? { Cookie: cookie } : undefined });
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
}
await Promise.all(Array.from({ length: watchers }, () => watcher()));
latencies.sort((a, b) => a - b);
const p95Ms = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const errorRate = requests ? errors / requests : 1;
const result = { ...plan, requests, errors, errorRate, p95Ms: Math.round(p95Ms), passed: p95Ms <= 800 && errorRate <= 0.01 };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
