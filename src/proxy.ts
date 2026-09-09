import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";

export function proxy(request: NextRequest) {
  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!validateAdminSession(session)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
