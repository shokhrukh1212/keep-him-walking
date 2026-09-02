import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

export function requireArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

export function applying(): boolean {
  return process.argv.includes("--apply");
}

export function requireApply(summary: unknown): void {
  if (applying()) return;
  process.stdout.write(`${JSON.stringify({ dryRun: true, summary }, null, 2)}\n`);
  process.exit(0);
}
