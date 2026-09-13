import { createHash } from "node:crypto";

const NON_PRODUCTION_REFS = new Set([
  "tkntxptfhmjnqaaveddx",
  "pqtfhkiftiubwuwxnuzd",
]);

export function supabaseProjectRef(publicUrl: string, databaseUrl: string): string {
  const publicRef = new URL(publicUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  if (!publicRef) throw new Error("Production Supabase URL has no valid project reference");
  const database = new URL(databaseUrl);
  if (!`${database.hostname}:${database.username}`.includes(publicRef)) {
    throw new Error("Production public and database URLs identify different projects");
  }
  return publicRef;
}

export function productionEnvironmentIdentity(
  environment: Record<string, string | undefined> = process.env,
) {
  const publicUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const databaseUrl = environment.SUPABASE_DB_URL;
  const expectedRef = environment.PRODUCTION_SUPABASE_PROJECT_REF;
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: publicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: environment.SUPABASE_SECRET_KEY,
    SUPABASE_DB_URL: databaseUrl,
    PRODUCTION_SUPABASE_PROJECT_REF: expectedRef,
  })) {
    if (!value) throw new Error(`Missing ${name} in .env.production.local`);
  }
  const projectRef = supabaseProjectRef(publicUrl!, databaseUrl!);
  if (NON_PRODUCTION_REFS.has(projectRef)) {
    throw new Error(`Refusing Production operation: ${projectRef} is a known rehearsal project`);
  }
  if (projectRef !== expectedRef) {
    throw new Error("PRODUCTION_SUPABASE_PROJECT_REF does not match the configured Production URLs");
  }
  return {
    projectRef,
    databaseUrl: databaseUrl!,
    fingerprint: createHash("sha256")
      .update(`${projectRef}:${environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`)
      .digest("hex").slice(0, 12),
  };
}
