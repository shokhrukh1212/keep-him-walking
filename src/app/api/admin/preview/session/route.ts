import { NextRequest, NextResponse } from "next/server";
import { issuePreviewSession, validatePreviewCredential } from "@/lib/admin/preview-auth";
import { readLimitedJson } from "@/lib/validation/http";
import { z } from "zod";

const schema = z.object({ secret: z.string().min(32).max(512), packId: z.string().regex(/^[a-z0-9-]+$/).optional() });

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await readLimitedJson(request, 1_024); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success || !validatePreviewCredential(parsed.data.secret)) return NextResponse.json({ error: "Preview access denied." }, { status: 403 });
  const response = NextResponse.json({ authenticated: true, path: parsed.data.packId ? `/preview/${parsed.data.packId}` : "/preview" });
  response.cookies.set("khw_preview", issuePreviewSession(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/preview", maxAge: 4 * 60 * 60 });
  return response;
}
