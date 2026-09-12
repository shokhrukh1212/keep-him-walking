import { buildScenePack } from "./authoring";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm scenes:build <slug>");
const report = await buildScenePack(process.cwd(), slug);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`);
