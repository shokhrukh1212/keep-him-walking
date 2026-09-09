import { readShareToken } from "@/lib/share/server-token";
import { shareDay } from "@/lib/share/data";
import { shareImage } from "@/lib/share/image";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const payload = readShareToken(token, "steps");
  const day = payload ? await shareDay(payload.day) : null;
  if (!payload || !day) return new Response("Invalid or expired card", { status: 404, headers: { "Cache-Control": "no-store" } });
  const minutes = Math.floor(payload.seconds / 60);
  return shareImage({
    eyebrow: `MY PART OF DAY ${day.dayNumber}`,
    title: `I kept him walking for ${minutes} min in ${day.cityName}.`,
    subtitle: `${payload.steps.toLocaleString()} steps were mine.`,
    stats: [day.countryName, "Confirmed contribution"],
  });
}
