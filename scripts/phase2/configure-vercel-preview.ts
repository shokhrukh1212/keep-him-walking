import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { phase2EnvironmentIdentity } from "./environment";

const branch = "phase-2-seven-day-mvp";
await phase2EnvironmentIdentity();

function parse(source: string) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, "$2")]] : [];
  }));
}

const preview = parse(await readFile(path.join(process.cwd(), ".env.phase2-preview.local"), "utf8"));
const local = parse(await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => ""));
if (!preview.NEXT_PUBLIC_VEMETRIC_TOKEN && local.NEXT_PUBLIC_VEMETRIC_TOKEN) {
  preview.NEXT_PUBLIC_VEMETRIC_TOKEN = local.NEXT_PUBLIC_VEMETRIC_TOKEN;
}

const names = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_VEMETRIC_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
  "VISITOR_HASH_SECRET",
  "CRON_SECRET",
  "PHASE2_ENABLED",
  "PHASE2_PREVIEW_START_AT",
  "PHASE2_REHEARSAL_SCALE",
  "PHASE2_REHEARSAL_MODE",
  "PHASE2_SUPABASE_PROJECT_REF",
  "POSTCARD_UNLOCK_SECONDS",
  "POSTCARD_RETENTION_DAYS",
  "SUPABASE_POSTCARDS_BUCKET",
  "SUPABASE_SPONSOR_PRIVATE_BUCKET",
  "SUPABASE_SPONSOR_PUBLIC_BUCKET",
  "SPONSOR_RESERVATION_MINUTES",
  "SPONSOR_PAYMENT_PROVIDER",
  "SPONSOR_FIXTURE_SECRET",
  "LEMON_SQUEEZY_TEST_MODE",
  "PRESENCE_TTL_SECONDS",
  "STEPS_PER_ACTIVE_SECOND",
].filter((name) => Boolean(preview[name]));

const sensitive = new Set([
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_VEMETRIC_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
  "VISITOR_HASH_SECRET",
  "CRON_SECRET",
  "SPONSOR_FIXTURE_SECRET",
]);

for (const name of names) {
  const value = preview[name];
  const result = spawnSync("vercel", [
    "env", "add", name, "preview", branch,
    "--force", sensitive.has(name) ? "--sensitive" : "--no-sensitive", "--yes",
  ], { input: `${value}\n`, encoding: "utf8" });
  if (result.status !== 0) {
    const safeError = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(value, "[redacted]");
    throw new Error(`Failed to configure branch variable ${name}: ${safeError.trim()}`);
  }
  process.stdout.write(`${name}: configured for Preview branch ${branch}\n`);
}

process.stdout.write(`${JSON.stringify({ branch, environment: "preview", configured: names.length, productionVariablesModified: false, valuesPrinted: false })}\n`);
