import { NextRequest, NextResponse } from "next/server";
import { getCountryPack } from "@/content/countries/registry";
import { journeyCalendarEvent } from "@/lib/retention/calendar";

export async function GET(request: NextRequest) {
  const packId = request.nextUrl.searchParams.get("pack");
  const startsAtRaw = request.nextUrl.searchParams.get("startsAt");
  const pack = packId ? getCountryPack(packId) : null;
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  if (!pack || !startsAt || !Number.isFinite(startsAt.getTime())) return NextResponse.json({ error: "Invalid reminder." }, { status: 400 });
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1_000);
  const body = journeyCalendarEvent({ cityName: pack.cityName, countryName: pack.countryName, startsAt, endsAt, url: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin });
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="keep-him-walking-${pack.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics"`, "Cache-Control": "public, max-age=300" } });
}
