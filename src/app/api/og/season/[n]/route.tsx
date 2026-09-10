import { loadSeasonSheet } from "@/lib/season/data";
import { renderSeasonImage } from "@/lib/season/image";

type Context = { params: Promise<{ n: string }> };

export async function GET(_request: Request, { params }: Context) {
  const sheet = await loadSeasonSheet(Number((await params).n));
  if (!sheet) return new Response("Season unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  return renderSeasonImage(sheet);
}
