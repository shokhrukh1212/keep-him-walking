import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function argument(name: string) { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] ?? null : null; }
const execute = process.argv.includes("--execute");
const baseUrl = argument("base-url");
const watchers = Number(argument("watchers") ?? "1000");
const durationSeconds = Number(argument("duration") ?? "60");
const rampSeconds = Number(argument("ramp") ?? "30");
const heartbeatSeconds = Number(argument("heartbeat") ?? "20");
const expectedHost = argument("confirm-host");
const sponsorId = argument("sponsor-id");
const bypassFile = argument("vercel-bypass-file");
const protectionBypass = bypassFile ? readFileSync(bypassFile, "utf8").trim() : "";
if (bypassFile && !protectionBypass) throw new Error("--vercel-bypass-file is empty");
if (!Number.isInteger(watchers) || watchers < 1 || watchers > 1_000) throw new Error("--watchers must be 1..1000");
if (!Number.isFinite(durationSeconds) || durationSeconds < 10 || durationSeconds > 600) throw new Error("--duration must be 10..600 seconds");
if (!Number.isFinite(rampSeconds) || rampSeconds < 0 || rampSeconds > 300) throw new Error("--ramp must be 0..300 seconds");
if (!Number.isFinite(heartbeatSeconds) || heartbeatSeconds < 5 || heartbeatSeconds > 60) throw new Error("--heartbeat must be 5..60 seconds");
const plan = { target: "1000 concurrent watchers", watchers, durationSeconds, rampSeconds, heartbeatSeconds, scenarios: ["bootstrap", "presence", "vote-validation", "postcard-validation", "sponsor-redirect-if-configured"], budgets: { p95Ms: 800, errorRate: 0.01 }, protectedPreviewBypass: Boolean(protectionBypass), mutatesState: execute };
if (!execute) { process.stdout.write(`${JSON.stringify({ dryRun: true, ...plan }, null, 2)}\n`); process.exit(0); }
if (!baseUrl || !expectedHost) throw new Error("Execution requires --base-url and --confirm-host");
const target = new URL(baseUrl);
if (target.hostname !== expectedHost || !/(vercel\.app|localhost)$/.test(target.hostname) || target.hostname === new URL(process.env.PRODUCTION_APP_URL || "https://invalid.local").hostname) throw new Error("Refusing unconfirmed or Production load target");

const latencies: number[] = [];
const scenarioLatencies = new Map<string, number[]>();
const scenarioErrors = new Map<string, number>();
let requests = 0; let errors = 0;
const startedAt = Date.now();
const deadline = startedAt + (rampSeconds + durationSeconds) * 1_000;
async function measured(scenario: string, url: URL, init?: RequestInit) {
  const started = performance.now();
  try {
    const response = await fetch(url, init);
    requests += 1;
    if (response.status >= 500 || response.status === 429) {
      errors += 1;
      scenarioErrors.set(scenario, (scenarioErrors.get(scenario) ?? 0) + 1);
    }
    return response;
  } catch {
    requests += 1;
    errors += 1;
    scenarioErrors.set(scenario, (scenarioErrors.get(scenario) ?? 0) + 1);
    return null;
  } finally {
    const latency = performance.now() - started;
    latencies.push(latency);
    const values = scenarioLatencies.get(scenario) ?? [];
    values.push(latency);
    scenarioLatencies.set(scenario, values);
  }
}
async function watcher(index: number) {
  const sessionId = randomUUID();
  let cookie = "";
  const arrivalDelay = watchers === 1 ? 0 : (index / (watchers - 1)) * rampSeconds * 1_000;
  if (arrivalDelay > 0) await new Promise((resolve) => setTimeout(resolve, arrivalDelay));

  const bypassHeaders: Record<string, string> = {};
  if (protectionBypass) bypassHeaders["x-vercel-protection-bypass"] = protectionBypass;
  const bootstrap = await measured("bootstrap", new URL("/api/bootstrap", target), { cache: "no-store", headers: bypassHeaders });
  cookie = bootstrap?.headers.get("set-cookie")?.split(";")[0] ?? cookie;
  const headers = { "Content-Type": "application/json", Origin: target.origin, ...bypassHeaders, ...(cookie ? { Cookie: cookie } : {}) };
  await measured("presence", new URL("/api/presence/heartbeat", target), { method: "POST", headers, body: JSON.stringify({ sessionId, state: "visible", sceneReady: true }) });
  await measured("vote-validation", new URL("/api/votes", target), { method: "POST", headers, body: "{}" });
  await measured("postcard-validation", new URL("/api/postcards", target), { method: "POST", headers, body: "{}" });
  if (sponsorId) await measured("sponsor-redirect", new URL(`/r/sponsor/${encodeURIComponent(sponsorId)}`, target), { redirect: "manual", headers: { ...bypassHeaders, ...(cookie ? { Cookie: cookie } : {}) } });

  while (Date.now() + heartbeatSeconds * 1_000 < deadline) {
    await new Promise((resolve) => setTimeout(resolve, heartbeatSeconds * 1_000));
    await measured("presence", new URL("/api/presence/heartbeat", target), { method: "POST", headers, body: JSON.stringify({ sessionId, state: "visible", sceneReady: true }) });
  }
}
await Promise.all(Array.from({ length: watchers }, (_, index) => watcher(index)));
latencies.sort((a, b) => a - b);
const p95Ms = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const errorRate = requests ? errors / requests : 1;
const scenarios = Object.fromEntries([...scenarioLatencies].map(([name, values]) => {
  values.sort((a, b) => a - b);
  return [name, { requests: values.length, errors: scenarioErrors.get(name) ?? 0, p95Ms: Math.round(values[Math.floor(values.length * 0.95)] ?? 0) }];
}));
const result = { ...plan, requests, errors, errorRate, p95Ms: Math.round(p95Ms), scenarioResults: scenarios, passed: p95Ms <= 800 && errorRate <= 0.01 };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
