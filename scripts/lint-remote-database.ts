import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is required");

const result = spawnSync(
  "pnpm",
  ["exec", "supabase", "db", "lint", "--db-url", databaseUrl, "--level", "warning", "--fail-on", "error"],
  { encoding: "utf8" },
);
const redact = (value: string | null) => (value ?? "").replaceAll(databaseUrl, "[redacted]");
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
process.exit(result.status ?? 1);
