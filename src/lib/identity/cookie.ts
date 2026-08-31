import type { NextRequest, NextResponse } from "next/server";
import { newVisitorId, VISITOR_COOKIE } from "@/lib/identity/server";

export function visitorFromRequest(request: NextRequest): {
  visitorId: string;
  isNew: boolean;
} {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  return existing
    ? { visitorId: existing, isNew: false }
    : { visitorId: newVisitorId(), isNew: true };
}

export function attachVisitorCookie(
  response: NextResponse,
  visitorId: string,
  isNew: boolean,
): void {
  if (!isNew) return;
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
