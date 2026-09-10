import { buildPack } from "./authoring";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm pack:build <slug>");
const build = await buildPack(process.cwd(), slug);
process.stdout.write(`${JSON.stringify({ pack: slug, transferBytes: build.transferBytes, budgetBytes: build.assetBudgetBytes, zones: build.zones }, null, 2)}\n`);
