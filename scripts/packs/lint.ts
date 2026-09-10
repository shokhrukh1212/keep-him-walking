import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSlug } from "./authoring";
import { lintAuthoredContent } from "./safety";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: pnpm pack:lint <slug>");
const safeSlug = parseSlug(slug);
const candidate = JSON.parse(await readFile(path.join(process.cwd(), "art", safeSlug, "pack.json"), "utf8"));
const findings = await lintAuthoredContent(process.cwd(), candidate);
if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`${finding.path}: review banned topic “${finding.term}”\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${safeSlug}: no banned-topic keywords found. This lint does not replace cultural review.\n`);
}
