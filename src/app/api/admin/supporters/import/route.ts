import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { mapSupporterExport, parseCsv } from "@/lib/supporters/import";
import { supporterImportSchema } from "@/lib/supporters/validation";
import { apiError, readLimitedJson } from "@/lib/validation/http";
import { hasTrustedOrigin } from "@/lib/validation/origin";

export async function POST(request: NextRequest) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return apiError(404, "NOT_FOUND", "Not found.");
  if (!hasTrustedOrigin(request)) return apiError(403, "FORBIDDEN", "Untrusted request origin.");
  let body: unknown;
  try { body = await readLimitedJson(request, 2_100_000); } catch { return apiError(400, "BAD_REQUEST", "Invalid export upload."); }
  const parsed = supporterImportSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "UNPROCESSABLE", parsed.error.issues[0]?.message ?? "Invalid export mapping.");
  let rows;
  try {
    rows = mapSupporterExport(parseCsv(parsed.data.csv), parsed.data.mapping);
  } catch (error) {
    return apiError(422, "UNPROCESSABLE", error instanceof Error ? error.message : "The export could not be read.");
  }
  if (rows.length > 2_000) return apiError(413, "PAYLOAD_TOO_LARGE", "Import at most 2,000 transactions at a time.");
  const supabase = getServerSupabase();
  if (!supabase) return apiError(503, "UNAVAILABLE", "Supporter records are not configured.");
  const { data, error } = await supabase.rpc("import_supporter_contributions", {
    p_rows: rows,
    p_now: new Date().toISOString(),
  });
  if (error) return apiError(503, "UNAVAILABLE", "The export could not be imported.");
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
