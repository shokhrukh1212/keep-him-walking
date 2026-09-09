/**
 * Applies pending migrations to the Supabase project named by the env file it
 * is run with. There is no local Postgres in this repository, so a migration is
 * unverified until it has been pushed and its pgTAP suite has run against a
 * real database.
 *
 *   pnpm db:push:remote            # list local vs remote migrations
 *   pnpm db:push:remote --apply    # push every pending migration, in order
 */
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is required; run this through --env-file");

const apply = process.argv.includes("--apply");
const projectRef = new URL(databaseUrl).username.replace(/^postgres\./, "");
process.stdout.write(`${JSON.stringify({
  projectRef,
  operation: apply ? "apply-pending-migrations" : "list-migrations",
  apply,
})}\n`);

const result = spawnSync("pnpm", apply
  ? ["exec", "supabase", "db", "push", "--include-all", "--db-url", databaseUrl]
  : ["exec", "supabase", "migration", "list", "--db-url", databaseUrl], { stdio: "inherit" });
process.exit(result.status ?? 1);
