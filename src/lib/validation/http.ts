import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNAVAILABLE";

export function apiError(status: 400 | 403 | 404 | 409 | 413 | 422 | 429 | 503, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function readLimitedText(request: Request, maxBytes = 16_384): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error("BODY_TOO_LARGE");
  return raw;
}

export async function readLimitedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  return JSON.parse(await readLimitedText(request, maxBytes));
}
