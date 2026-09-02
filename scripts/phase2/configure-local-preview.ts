import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.join(process.cwd(), ".env.phase2-preview.local");
const source = await readFile(file, "utf8");
const lines = source.split(/\r?\n/).filter(Boolean);
const values = new Map<string, string>();
for (const line of lines) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}
const supabaseUrl = values.get("NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required before configuring Phase 2");
const reference = new URL(supabaseUrl).hostname.match(/^(?:db\.)?([a-z0-9]+)\.supabase\.co$/)?.[1];
if (!reference) throw new Error("Unable to derive isolated Supabase project reference");
values.set("NEXT_PUBLIC_SUPABASE_URL", `https://${reference}.supabase.co`);
const secret = () => randomBytes(48).toString("base64url");
const defaults: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: "https://keep-him-walking-git-phase-2-f6cf95-shokhrukh-karimovs-projects.vercel.app",
  VISITOR_HASH_SECRET: secret(),
  CRON_SECRET: secret(),
  SPONSOR_FIXTURE_SECRET: secret(),
  PHASE2_SUPABASE_PROJECT_REF: reference,
  PHASE2_ENABLED: "true",
  PHASE2_REHEARSAL_MODE: "true",
  PHASE2_REHEARSAL_SCALE: "144",
  SPONSOR_PAYMENT_PROVIDER: "fixture",
  LEMON_SQUEEZY_TEST_MODE: "true",
  PRESENCE_TTL_SECONDS: "50",
  STEPS_PER_ACTIVE_SECOND: "1.8",
  POSTCARD_UNLOCK_SECONDS: "60",
  POSTCARD_RETENTION_DAYS: "365",
  SUPABASE_POSTCARDS_BUCKET: "khw-postcards",
  SUPABASE_SPONSOR_PRIVATE_BUCKET: "khw-sponsor-private",
  SUPABASE_SPONSOR_PUBLIC_BUCKET: "khw-sponsor-public",
  SPONSOR_RESERVATION_MINUTES: "30",
};
for (const [name, value] of Object.entries(defaults)) if (!values.get(name)) values.set(name, value);
await writeFile(file, `${[...values].map(([name, value]) => `${name}=${value}`).join("\n")}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ configured: true, projectRef: reference, generatedSecrets: ["VISITOR_HASH_SECRET", "CRON_SECRET", "SPONSOR_FIXTURE_SECRET"], valuesPrinted: false })}\n`);
