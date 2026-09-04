import { NextRequest, NextResponse } from "next/server";
import { getCountryPack } from "@/content/countries/registry";
import { validatePreviewCredential, validatePreviewSession } from "@/lib/admin/preview-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!validatePreviewCredential(bearer) && !validatePreviewSession(request.cookies.get("khw_preview")?.value)) return NextResponse.json({ error: "Preview access denied." }, { status: 403 });
  const { packId } = await params;
  const pack = getCountryPack(packId);
  if (!pack) return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  const zone = request.nextUrl.searchParams.get("zone");
  const zoneIndex = Math.max(0, pack.route.zones.findIndex((candidate) => candidate.id === zone));
  const activeZone = pack.route.zones[zoneIndex];
  return NextResponse.json({
    packId: pack.assetVersion,
    country: pack.countryName,
    city: pack.cityName,
    schemaVersion: pack.schemaVersion,
    zone: activeZone ? { id: activeZone.id, label: activeZone.label, fallbackUrl: activeZone.fallbackUrl, durationActiveSeconds: activeZone.durationActiveSeconds } : null,
    zoneCount: pack.route.zones.length,
  }, { headers: { "Cache-Control": "no-store" } });
}
