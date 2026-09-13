import { expect, it } from "vitest";
import { productionEnvironmentIdentity, supabaseProjectRef } from "../../../scripts/production/environment";

const production = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
  SUPABASE_SECRET_KEY: "server-key",
  SUPABASE_DB_URL: "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0.pooler.supabase.com:6543/postgres",
  PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
};

it("accepts matching explicit Production identities without exposing credentials", () => {
  expect(productionEnvironmentIdentity(production)).toMatchObject({
    projectRef: "abcdefghijklmnopqrst",
    databaseUrl: production.SUPABASE_DB_URL,
  });
});

it("rejects a mismatched database identity", () => {
  expect(() => supabaseProjectRef(
    production.NEXT_PUBLIC_SUPABASE_URL,
    "postgresql://postgres.otherproject:secret@aws-0.pooler.supabase.com/postgres",
  )).toThrow(/different projects/);
});

it.each(["tkntxptfhmjnqaaveddx", "pqtfhkiftiubwuwxnuzd"])(
  "rejects known rehearsal project %s",
  (projectRef) => expect(() => productionEnvironmentIdentity({
    ...production,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_DB_URL: `postgresql://postgres.${projectRef}:secret@aws-0.pooler.supabase.com/postgres`,
    PRODUCTION_SUPABASE_PROJECT_REF: projectRef,
  })).toThrow(/known rehearsal project/),
);
