import { spawnSync } from "node:child_process";
import { productionEnvironmentIdentity } from "./environment";

const identity = productionEnvironmentIdentity();
const apply = process.argv.includes("--apply");
process.stdout.write(`${JSON.stringify({ projectRef: identity.projectRef, operation: apply ? "apply migrations" : "list migrations" })}\n`);
const args = apply
  ? ["exec", "supabase", "db", "push", "--include-all", "--db-url", identity.databaseUrl]
  : ["exec", "supabase", "migration", "list", "--db-url", identity.databaseUrl];
const result = spawnSync("pnpm", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
