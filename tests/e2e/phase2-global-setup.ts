import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export const PHASE2_VERCEL_STORAGE_STATE = path.join(
  tmpdir(),
  "keep-him-walking-phase2-vercel-storage-state.json",
);
export const PHASE2_PREVIEW_DEPLOYMENT = process.env.PHASE2_PREVIEW_URL
  ?? "https://keep-him-walking-git-phase-2-f6cf95-shokhrukh-karimovs-projects.vercel.app";

export type NetscapeCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
};

function parseCookieJar(source: string): NetscapeCookie[] {
  return source.split(/\r?\n/).flatMap((line) => {
    const httpOnly = line.startsWith("#HttpOnly_");
    const normalized = httpOnly ? line.slice("#HttpOnly_".length) : line;
    if (!normalized || normalized.startsWith("#")) return [];
    const [domain, , cookiePath, secure, expires, name, value] = normalized.split("\t");
    if (!domain || !cookiePath || !name || value === undefined) return [];
    return [{
      name,
      value,
      domain,
      path: cookiePath,
      expires: Number(expires) || -1,
      httpOnly,
      secure: secure === "TRUE",
      sameSite: "Lax" as const,
    }];
  });
}

export async function protectedPreviewCookies(deployment: string): Promise<NetscapeCookie[]> {
  const parsed = new URL(deployment);
  if (parsed.protocol !== "https:" || !parsed.hostname.includes("git-phase-2")) {
    throw new Error("Refusing to create a bypass cookie for anything except the Phase 2 branch alias");
  }

  const work = await mkdtemp(path.join(tmpdir(), "khw-phase2-vercel-"));
  const cookieJar = path.join(work, "cookies.txt");
  try {
    const result = spawnSync("vercel", [
      "curl",
      "/?x-vercel-set-bypass-cookie=true",
      "--deployment",
      deployment,
      "--yes",
      "--",
      "--cookie-jar",
      cookieJar,
      "--silent",
      "--output",
      "/dev/null",
    ], { encoding: "utf8", timeout: 45_000, killSignal: "SIGTERM" });
    if (result.error) {
      throw new Error(`Protected-preview session command failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`Unable to obtain a protected-preview session: ${(result.stderr || result.stdout).trim()}`);
    }
    const cookies = parseCookieJar(await readFile(cookieJar, "utf8"));
    if (!cookies.length) throw new Error("Vercel did not return a protected-preview bypass cookie");
    return cookies;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export default async function phase2GlobalSetup() {
  const cookies = await protectedPreviewCookies(PHASE2_PREVIEW_DEPLOYMENT);
  await writeFile(PHASE2_VERCEL_STORAGE_STATE, JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ protectedPreviewSession: true, cookieCount: cookies.length, valuesPrinted: false })}\n`);
}
