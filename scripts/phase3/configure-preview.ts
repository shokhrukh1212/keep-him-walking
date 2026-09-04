import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { phase2EnvironmentIdentity } from "../phase2/environment";

const branch = "phase-3-launch-hardening";
const identity = await phase2EnvironmentIdentity();
const root = process.cwd();
const sourcePath = path.join(root, ".env.phase2-preview.local");
const targetPath = path.join(root, ".env.phase3-preview.local");
const appUrlIndex = process.argv.indexOf("--app-url");
const appUrl = appUrlIndex >= 0 ? process.argv[appUrlIndex + 1] : undefined;

function parse(source: string) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^(?:["'])(.*)(?:["'])$/, "$1")]] : [];
  }));
}

const source = parse(await readFile(sourcePath, "utf8"));
const existing = parse(await readFile(targetPath, "utf8").catch(() => ""));
const values: Record<string, string> = {
  ...source,
  ...existing,
  PREVIEW_ACCESS_SECRET: existing.PREVIEW_ACCESS_SECRET || randomBytes(36).toString("base64url"),
};
if (appUrl) values.NEXT_PUBLIC_APP_URL = new URL(appUrl).origin;
else delete values.NEXT_PUBLIC_APP_URL;
const names = [
  "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_VEMETRIC_TOKEN",
  "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL", "VISITOR_HASH_SECRET", "CRON_SECRET", "PHASE2_ENABLED", "PHASE2_PREVIEW_START_AT",
  "PHASE2_REHEARSAL_SCALE", "PHASE2_REHEARSAL_MODE", "PHASE2_SUPABASE_PROJECT_REF", "POSTCARD_UNLOCK_SECONDS", "POSTCARD_RETENTION_DAYS",
  "SUPABASE_POSTCARDS_BUCKET", "SUPABASE_SPONSOR_PRIVATE_BUCKET", "SUPABASE_SPONSOR_PUBLIC_BUCKET", "SPONSOR_RESERVATION_MINUTES",
  "SPONSOR_PAYMENT_PROVIDER", "SPONSOR_FIXTURE_SECRET", "LEMON_SQUEEZY_TEST_MODE", "PRESENCE_TTL_SECONDS", "STEPS_PER_ACTIVE_SECOND",
  "PREVIEW_ACCESS_SECRET", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_TRACES_SAMPLE_RATE", "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "BETTER_STACK_SOURCE_TOKEN", "BETTER_STACK_INGEST_URL", "PRODUCTION_APP_URL", "NOTIFICATION_DELIVERY_PROVIDER",
].filter((name) => Boolean(values[name]));
const sensitive = new Set(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_VEMETRIC_TOKEN", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL", "VISITOR_HASH_SECRET", "CRON_SECRET", "SPONSOR_FIXTURE_SECRET", "PREVIEW_ACCESS_SECRET", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "BETTER_STACK_SOURCE_TOKEN"]);

await writeFile(targetPath, `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n")}\n`, { mode: 0o600 });
for (const name of names) {
  const value = values[name];
  const result = spawnSync("vercel", ["env", "add", name, "preview", branch, "--force", sensitive.has(name) ? "--sensitive" : "--no-sensitive", "--yes"], { input: `${value}\n`, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Failed to configure ${name}; provider output withheld to avoid accidental value disclosure.`);
  process.stdout.write(`${name}: configured for Preview branch ${branch}\n`);
}
process.stdout.write(`${JSON.stringify({ branch, projectRef: identity.projectRef, environment: "preview", configured: names.length, generatedPreviewSecret: !existing.PREVIEW_ACCESS_SECRET, productionVariablesModified: false, valuesPrinted: false })}\n`);
