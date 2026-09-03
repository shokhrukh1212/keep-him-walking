import { spawn, type ChildProcess } from "node:child_process";
import { adminClient } from "./lib";
import { phase2EnvironmentIdentity } from "./environment";

const PREVIEW_SLUG = "phase2-seven-day-preview";
const ACCELERATED_SCALE = 144;

type PreviewClock = {
  realStart: string;
  storyStart: string;
  scale: number;
};

let activeChild: ChildProcess | null = null;
let receivedSignal: NodeJS.Signals | null = null;

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = null;
      if (signal) {
        reject(new Error(`${command} exited after ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function runGuardedScript(
  script: string,
  clock: PreviewClock,
): Promise<void> {
  const code = await run(
    process.execPath,
    ["--import", "tsx", script, "--apply"],
    {
      ...process.env,
      PHASE2_PREVIEW_START_AT: clock.realStart,
      PHASE2_REHEARSAL_SCALE: String(clock.scale),
    },
  );
  if (code !== 0) throw new Error(`${script} failed with exit code ${code}`);
}

async function reset(clock: PreviewClock): Promise<void> {
  await runGuardedScript("scripts/phase2/reset-preview.ts", clock);
}

async function seed(clock: PreviewClock): Promise<void> {
  await runGuardedScript("scripts/phase2/seed-preview.ts", clock);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    receivedSignal = signal;
    activeChild?.kill(signal);
  });
}

await phase2EnvironmentIdentity();
const supabase = adminClient();
const { data: existing, error } = await supabase
  .from("journeys")
  .select("status,phase2_enabled,real_time_anchor_at,story_time_anchor_at,story_time_scale")
  .eq("slug", PREVIEW_SLUG)
  .maybeSingle();

if (error) throw error;
if (
  !existing
  || existing.status !== "preview"
  || !existing.phase2_enabled
  || !existing.real_time_anchor_at
  || !existing.story_time_anchor_at
) {
  throw new Error("Canonical rehearsal requires the guarded Phase 2 preview seed");
}

const originalClock: PreviewClock = {
  realStart: new Date(existing.real_time_anchor_at).toISOString(),
  storyStart: new Date(existing.story_time_anchor_at).toISOString(),
  scale: Number(existing.story_time_scale),
};
if (
  !Number.isFinite(originalClock.scale)
  || new Date(originalClock.realStart).getTime() !== new Date(originalClock.storyStart).getTime()
) {
  throw new Error("The guarded preview clock cannot be restored by the Phase 2 seed contract");
}

const acceleratedStart = new Date();
acceleratedStart.setUTCSeconds(0, 0);
const acceleratedClock: PreviewClock = {
  realStart: acceleratedStart.toISOString(),
  storyStart: acceleratedStart.toISOString(),
  scale: ACCELERATED_SCALE,
};

let previewReplaced = false;
let rehearsalCode = 1;
try {
  await reset(originalClock);
  previewReplaced = true;
  await seed(acceleratedClock);
  process.stdout.write(`${JSON.stringify({ canonicalRehearsal: true, scale: ACCELERATED_SCALE, stablePreviewWillBeRestored: true, valuesPrinted: false })}\n`);
  rehearsalCode = await run(
    process.execPath,
    [
      "--env-file=.env.phase2-preview.local",
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.phase2.config.ts",
    ],
    {
      ...process.env,
      RUN_PHASE2_REHEARSAL: "1",
      PHASE2_PREVIEW_START_AT: acceleratedClock.realStart,
      PHASE2_REHEARSAL_SCALE: String(ACCELERATED_SCALE),
    },
  );
} finally {
  if (previewReplaced) {
    await reset(acceleratedClock);
    await seed(originalClock);
    process.stdout.write(`${JSON.stringify({ stablePreviewRestored: true, scale: originalClock.scale, valuesPrinted: false })}\n`);
  }
}

if (receivedSignal) {
  process.kill(process.pid, receivedSignal);
} else if (rehearsalCode !== 0) {
  process.exitCode = rehearsalCode;
}
