import { NextRequest, NextResponse } from "next/server";
import { getCountryPack } from "@/content/countries/registry";
import { validatePreviewCredential, validatePreviewSession } from "@/lib/admin/preview-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const sessionValid = validatePreviewSession(request.cookies.get("khw_preview")?.value);
  if (!validatePreviewCredential(bearer) && !sessionValid) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { packId } = await params;
  const pack = getCountryPack(packId);
  if (!pack) return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  const zone = request.nextUrl.searchParams.get("zone");
  const zoneIndex = Math.max(0, pack.route.zones.findIndex((candidate) => candidate.id === zone));
  const activeZone = pack.route.zones[zoneIndex];
  const editor = new URL(`/preview/${encodeURIComponent(packId)}`, request.url);
  editor.searchParams.set("calibrate", "1");
  editor.searchParams.set("zone", activeZone.id);
  // Browser entry point; retain JSON for existing API consumers and bearer clients.
  if (sessionValid && request.headers.get("accept")?.includes("text/html")) {
    const response = NextResponse.redirect(editor);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Accept, Cookie, Authorization");
    return response;
  }
  return NextResponse.json({
    packId: pack.assetVersion,
    country: pack.countryName,
    city: pack.cityName,
    schemaVersion: pack.schemaVersion,
    zone: activeZone ? { id: activeZone.id, label: activeZone.label, fallbackUrl: activeZone.fallbackUrl, durationActiveSeconds: activeZone.durationActiveSeconds, stage: activeZone.stage } : null,
    calibrationUrl: `${editor.pathname}${editor.search}`,
    zoneCount: pack.route.zones.length,
  }, { headers: { "Cache-Control": "private, no-store", Vary: "Accept, Cookie, Authorization" } });
}
