import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { apiError } from "@/lib/validation/http";

export async function GET(request: NextRequest) {
  const purchase = request.nextUrl.searchParams.get("purchase");
  if (!purchase || !/^[0-9a-f-]{36}$/i.test(purchase)) return apiError(400, "BAD_REQUEST", "Invalid purchase reference.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Purchase status is unavailable.");
  const { data } = await supabase.from("sponsorships").select("status").eq("public_id", purchase).maybeSingle();
  if (!data) return apiError(404, "NOT_FOUND", "Purchase status is unavailable.");
  return NextResponse.json({ status: data.status }, { headers: { "Cache-Control": "no-store" } });
}
