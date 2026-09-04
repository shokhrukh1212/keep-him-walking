import { spawnSync } from "node:child_process";
import { phase2EnvironmentIdentity } from "../phase2/environment";

const identity = await phase2EnvironmentIdentity();
const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({ projectRef: identity.projectRef, operation: apply ? "apply-additive-phase3-migration-007" : "list-migrations", productionModified: false, apply })}\n`);
const command = apply
  ? ["exec", "supabase", "db", "push", "--include-all", "--db-url", identity.databaseUrl]
  : ["exec", "supabase", "migration", "list", "--db-url", identity.databaseUrl];
const result = spawnSync("pnpm", command, { stdio: "inherit" });
process.exit(result.status ?? 1);
