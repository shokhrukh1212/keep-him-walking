import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadPostKit } from "@/lib/postkit/data";

type Context = { params: Promise<{ n: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  if (!validateAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const dayNumber = Number((await params).n);
  const kit = await loadPostKit(dayNumber, request.nextUrl.origin);
  if (!kit) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(kit, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
