import { NextRequest, NextResponse } from "next/server";
import { loadBuyMeACoffeeSupporters, paginateSupporters } from "@/lib/supporters/buy-me-a-coffee";
import { configuredCoffeeAccessToken } from "@/lib/supporters/config";

export async function GET(request: NextRequest) {
  const beforeAt = request.nextUrl.searchParams.get("beforeAt");
  const beforeId = request.nextUrl.searchParams.get("beforeId");
  if ((beforeAt === null) !== (beforeId === null)
    || (beforeAt !== null && !Number.isFinite(new Date(beforeAt).getTime()))
    || (beforeId !== null && (beforeId.length < 1 || beforeId.length > 200))) {
    return NextResponse.json({ error: "Invalid supporter page." }, { status: 400 });
  }
  const token = configuredCoffeeAccessToken(process.env.BUY_ME_A_COFFEE_ACCESS_TOKEN);
  if (!token) return NextResponse.json({ error: "Supporter sync is not configured." }, { status: 503 });
  try {
    const page = paginateSupporters(await loadBuyMeACoffeeSupporters(token), beforeId);
    return NextResponse.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Supporters are temporarily unavailable." }, { status: 503 });
  }
}
