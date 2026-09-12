import { buildScenePack } from "../scenes/authoring";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm pack:build <slug>");
const build = await buildScenePack(process.cwd(), slug);
process.stdout.write(`${JSON.stringify(build, null, 2)}\n`);
for (const warning of build.warnings) process.stderr.write(`Warning: ${warning}\n`);
