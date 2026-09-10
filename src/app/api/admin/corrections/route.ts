import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadCorrections, type CorrectionStatus } from "@/lib/corrections/data";

const STATUSES = new Set<CorrectionStatus>(["new", "accepted", "rejected"]);

export async function GET(request: NextRequest) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const rawStatus = request.nextUrl.searchParams.get("status") ?? "new";
  if (!STATUSES.has(rawStatus as CorrectionStatus)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const corrections = await loadCorrections(rawStatus as CorrectionStatus);
  return NextResponse.json({ corrections }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
