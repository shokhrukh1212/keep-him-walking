import { spawnSync } from "node:child_process";
import { phase2EnvironmentIdentity } from "./environment";

const identity = await phase2EnvironmentIdentity();
const apply = process.argv.includes("--apply");
const command = apply
  ? ["exec", "supabase", "db", "push", "--include-all", "--db-url", identity.databaseUrl]
  : ["exec", "supabase", "migration", "list", "--db-url", identity.databaseUrl];
process.stdout.write(`${JSON.stringify({ projectRef: identity.projectRef, operation: apply ? "apply-migrations-001-through-006" : "list-migrations", apply })}\n`);
const result = spawnSync("pnpm", command, { stdio: "inherit" });
process.exit(result.status ?? 1);
