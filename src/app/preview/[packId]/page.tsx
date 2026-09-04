import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCountryPack } from "@/content/countries/registry";
import { validatePreviewSession } from "@/lib/admin/preview-auth";

export const dynamic = "force-dynamic";

export default async function CountryPackPreview({ params }: { params: Promise<{ packId: string }> }) {
  if (!validatePreviewSession((await cookies()).get("khw_preview")?.value)) redirect("/preview");
  const pack = getCountryPack((await params).packId);
  if (!pack || pack.schemaVersion !== 3) notFound();
  return <main className="policy-page preview-country"><p className="eyebrow">Private editorial preview · unpublished content may appear</p><h1>{pack.cityName}, {pack.countryName}</h1><p>{pack.packId} · {pack.route.zones.length} route zones · {pack.storyBeats.length} story beats</p><p><Link href="/preview">All packs</Link></p><section>{pack.route.zones.map((zone) => <article key={zone.id}><Image src={zone.fallbackUrl} alt={`${zone.label} staging artwork`} width={1600} height={900} sizes="(max-width: 900px) 100vw, 900px" /><div><span className="eyebrow">{zone.weather}</span><h2>{zone.label}</h2><p>{zone.durationActiveSeconds} active seconds · {zone.layers.length} depth layers · {zone.props.length} prop systems</p></div></article>)}</section></main>;
}
