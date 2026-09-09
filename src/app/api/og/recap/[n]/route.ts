import { loadRecapDay } from "@/lib/recap/data";
import { renderRecapImage } from "@/lib/recap/image";

type Context = { params: Promise<{ n: string }> };

export async function GET(_request: Request, { params }: Context) {
  const dayNumber = Number((await params).n);
  const recap = await loadRecapDay(dayNumber);
  if (!recap) return new Response("Recap unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  return renderRecapImage(recap);
}
