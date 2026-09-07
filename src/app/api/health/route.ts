import { NextResponse } from "next/server";
import { registeredCountryPacks } from "@/content/countries/registry";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = performance.now();
  const supabase = getServerSupabase();
  let database: "ready" | "unconfigured" | "unavailable" = supabase ? "unavailable" : "unconfigured";
  if (supabase) {
    const { error } = await supabase.from("journeys").select("id", { head: true, count: "exact" }).limit(1);
    database = error ? "unavailable" : "ready";
  }
  const packs = registeredCountryPacks();
  const ready = database === "ready" && packs.length >= 9;
  return NextResponse.json({
    status: ready ? "ready" : "degraded",
    checks: { database, content: packs.length >= 9 ? "ready" : "unavailable", registeredPacks: packs.length },
    latencyMs: Math.round(performance.now() - started),
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
