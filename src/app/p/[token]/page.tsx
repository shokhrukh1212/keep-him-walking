import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicPostcard } from "@/lib/postcards/service";
import Link from "next/link";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const postcard = await findPublicPostcard(token);
  if (!postcard?.countryDay) return { title: "Postcard unavailable — Keep Him Walking" };
  const title = `${postcard.countryDay.city_name} postcard — Keep Him Walking`;
  const description = `A shared walking postcard from ${postcard.countryDay.city_name}, ${postcard.countryDay.country_name}.`;
  return { title, description, openGraph: { title, description, images: [{ url: postcard.openGraph, width: 1200, height: 630 }] } };
}

export default async function PublicPostcardPage({ params }: Props) {
  const { token } = await params;
  const postcard = await findPublicPostcard(token);
  if (!postcard?.countryDay) notFound();
  return (
    <main className="content-page postcard-public">
      <Link className="back-link" href="/">← Return to the walk</Link>
      <span className="eyebrow">DAY {postcard.countryDay.day_number} POSTCARD</span>
      <h1>{postcard.countryDay.city_name}, {postcard.countryDay.country_name}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={postcard.image} alt={`Illustrated postcard from ${postcard.countryDay.city_name}`} />
      <a className="primary-button" href={postcard.image} download>Download postcard</a>
    </main>
  );
}
