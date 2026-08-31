import type { NextRequest } from "next/server";

export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const expected = configured ? new URL(configured).origin : request.nextUrl.origin;
  return origin === expected || origin === request.nextUrl.origin;
}
