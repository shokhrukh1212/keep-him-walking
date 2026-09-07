import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
] as const;

function parseEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function projectRef(url: string, databaseUrl: string): string {
  const publicMatch = new URL(url).hostname.match(/^(?:db\.)?([a-z0-9]+)\.supabase\.co$/);
  if (!publicMatch) throw new Error("Phase 2 Supabase URL does not contain a valid project reference");
  const reference = publicMatch[1];
  const parsedDatabase = new URL(databaseUrl);
  const databaseIdentity = `${parsedDatabase.hostname}:${parsedDatabase.username}`;
  if (!databaseIdentity.includes(reference)) throw new Error("Phase 2 URL and database project references do not match");
  return reference;
}

export async function phase2EnvironmentIdentity() {
  for (const name of REQUIRED) if (!process.env[name]) throw new Error(`Missing ${name} in .env.phase2-preview.local`);
  const localPath = path.join(process.cwd(), ".env.local");
  const local = parseEnv(await readFile(localPath, "utf8").catch(() => ""));
  for (const name of REQUIRED) {
    if (local[name] && local[name] === process.env[name]) {
      throw new Error(`Refusing Phase 2 operation: ${name} matches .env.local`);
    }
  }
  const reference = projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_DB_URL!);
  const expected = process.env.PHASE2_SUPABASE_PROJECT_REF;
  if (expected && expected !== reference) throw new Error("PHASE2_SUPABASE_PROJECT_REF does not match the configured preview URL");
  return {
    projectRef: reference,
    fingerprint: createHash("sha256").update(`${reference}:${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`).digest("hex").slice(0, 12),
    databaseUrl: process.env.SUPABASE_DB_URL!,
  };
}
