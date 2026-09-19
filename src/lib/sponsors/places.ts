/**
 * The ten places beside the walk — five down each side on a desktop screen, one
 * swipeable row on a phone. A place is either empty and for sale, or taken by a
 * product with a name, a mark, one factual line and a website.
 *
 * Everything a place shows is owner-curated: no visitor free text reaches it.
 *
 * REVIEW FIXTURE. The five taken places below are placeholders so the layout, the
 * modal and the checkout can be looked at. Their marks are drawn by hand in
 * `SponsorPlaceMark` and are not the brands' own artwork, their `views` are made up
 * and are always labelled as not measured, and none of them has paid for anything.
 * Replace this constant with the reviewed, paid sponsors before this ships.
 */

/** One place, one price, one payment. */
export const SPONSOR_PLACE_PRICE_CENTS = 5_000;
export const SPONSOR_PLACE_CURRENCY = "USD";

/** How many places each side of the scene holds. */
export const SPONSOR_PLACES_PER_SIDE = 5;

export type SponsorMarkName = "google" | "chatgpt" | "claude" | "vercel" | "figma";

export type SponsorPlaceBrand = {
  name: string;
  /** One factual line about what the product is. It never claims a result. */
  description: string;
  href: string;
  mark: SponsorMarkName;
  /** Fixture only. The page never presents these as measured. */
  views: number;
  clicks: number;
};

export type SponsorPlaceSide = "left" | "right";

export type SponsorPlace = {
  id: string;
  side: SponsorPlaceSide;
  /** 1-based position down its own side. */
  position: number;
  brand: SponsorPlaceBrand | null;
};

function empty(side: SponsorPlaceSide, position: number): SponsorPlace {
  return { id: `${side}-${position}`, side, position, brand: null };
}

function taken(side: SponsorPlaceSide, position: number, brand: SponsorPlaceBrand): SponsorPlace {
  return { id: `${side}-${position}`, side, position, brand };
}

export const SPONSOR_PLACES: readonly SponsorPlace[] = [
  empty("left", 1),
  empty("left", 2),
  empty("left", 3),
  empty("left", 4),
  empty("left", 5),
  taken("right", 1, {
    name: "Google",
    description: "Search, mail and the rest of the everyday web tools.",
    href: "https://www.google.com",
    mark: "google",
    views: 12,
    clicks: 3,
  }),
  taken("right", 2, {
    name: "ChatGPT",
    description: "An assistant for writing, coding and everyday questions.",
    href: "https://chatgpt.com",
    mark: "chatgpt",
    views: 48,
    clicks: 9,
  }),
  taken("right", 3, {
    name: "Claude",
    description: "An assistant for long documents, analysis and code.",
    href: "https://claude.ai",
    mark: "claude",
    views: 31,
    clicks: 6,
  }),
  taken("right", 4, {
    name: "Vercel",
    description: "Hosting and deployment for front-end applications.",
    href: "https://vercel.com",
    mark: "vercel",
    views: 20,
    clicks: 4,
  }),
  taken("right", 5, {
    name: "Figma",
    description: "A browser design tool teams draw interfaces in together.",
    href: "https://www.figma.com",
    mark: "figma",
    views: 17,
    clicks: 2,
  }),
];

/** The places down one side, in the order they are drawn. */
export function placesOnSide(
  places: readonly SponsorPlace[],
  side: SponsorPlaceSide,
): readonly SponsorPlace[] {
  return places.filter((place) => place.side === side);
}

/**
 * 1–10 across both sides: left runs 1–5 and right continues 6–10, so a buyer and
 * the owner can name the same place without saying "left" or "right".
 */
export function placeNumber(place: SponsorPlace): number {
  return place.side === "left" ? place.position : SPONSOR_PLACES_PER_SIDE + place.position;
}

/** What a place is called everywhere it is named: the tile, the modal, the receipt. */
export function placeName(place: SponsorPlace): string {
  return `Place ${placeNumber(place)}`;
}

/** The accessible name of the tile itself, which says what pressing it does. */
export function placeTileLabel(place: SponsorPlace): string {
  return place.brand
    ? `${place.brand.name} — sponsor of ${placeName(place).toLowerCase()}`
    : `${placeName(place)} is free — sponsor it`;
}

/**
 * The phone's single row. One side of the scene is all empty and the other all
 * taken, so drawing them in place order would put five plus signs together; this
 * alternates taken and empty and keeps whatever is left over at the end.
 */
export function carouselPlaces(places: readonly SponsorPlace[]): readonly SponsorPlace[] {
  const withBrand = places.filter((place) => place.brand !== null);
  const free = places.filter((place) => place.brand === null);
  const row: SponsorPlace[] = [];
  for (let index = 0; index < Math.max(withBrand.length, free.length); index += 1) {
    const brand = withBrand[index];
    const gap = free[index];
    if (brand) row.push(brand);
    if (gap) row.push(gap);
  }
  return row;
}
