import { spawnSync } from "node:child_process";
import { productionEnvironmentIdentity } from "./environment";

const identity = productionEnvironmentIdentity();
const action = process.argv[2];
const command = action === "seed"
  ? ["node", "--import", "tsx", "scripts/seed-season1.ts", ...process.argv.slice(3)]
  : action === "test"
    ? ["node", "--import", "tsx", "scripts/test-database.ts"]
    : action === "lint"
      ? ["node", "--import", "tsx", "scripts/lint-remote-database.ts"]
      : null;
if (!command) throw new Error("Expected production action: seed, test, or lint");
process.stdout.write(`${JSON.stringify({ projectRef: identity.projectRef, action })}\n`);
const result = spawnSync(command[0], command.slice(1), { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
