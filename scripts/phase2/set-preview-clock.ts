import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.join(process.cwd(), ".env.phase2-preview.local");
const source = await readFile(file, "utf8");
const values = new Map<string, string>();
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}
const scaleArgument = process.argv.find((argument) => argument.startsWith("--scale="))?.split("=")[1] ?? "144";
const scale = Number(scaleArgument);
if (!Number.isFinite(scale) || scale < 1 || scale > 144) throw new Error("--scale must be between 1 and 144");
const minutesArgument = process.argv.find((argument) => argument.startsWith("--start-in-minutes="))?.split("=")[1] ?? "0";
const minutes = Number(minutesArgument);
if (!Number.isFinite(minutes) || minutes < 0 || minutes > 120) throw new Error("--start-in-minutes must be between 0 and 120");
const start = new Date(Date.now() + minutes * 60_000);
start.setUTCSeconds(0, 0);
values.set("PHASE2_PREVIEW_START_AT", start.toISOString());
values.set("PHASE2_REHEARSAL_SCALE", String(scale));
await writeFile(file, `${[...values].map(([name, value]) => `${name}=${value}`).join("\n")}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ previewOnly: true, startsAt: start.toISOString(), scale })}\n`);
