import { readShareToken } from "@/lib/share/server-token";
import { shareDay } from "@/lib/share/data";
import { shareImage } from "@/lib/share/image";

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const payload = readShareToken(token, "first");
  const day = payload ? await shareDay(payload.day) : null;
  if (!payload || !day) return new Response("Invalid or expired card", { status: 404, headers: { "Cache-Control": "no-store" } });
  const localTime = new Intl.DateTimeFormat("en", { timeZone: day.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(payload.foundAt * 1_000));
  return shareImage({
    eyebrow: "FIRST WATCHER",
    title: `I found him waiting alone in ${day.cityName}.`,
    subtitle: `He had been there ${duration(payload.waited)}.`,
    stats: [`Found at ${localTime} local time`, `Day ${day.dayNumber}`],
  });
}
