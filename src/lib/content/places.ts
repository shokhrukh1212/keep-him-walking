import type { CountryPack, RouteZone } from "./schema";

/** Semantic place lookup shared by stories, seed tools and longer manifests. */
export function placeTagsOf(zone: Pick<RouteZone, "tags" | "kind">): string[] {
  return zone.tags.length > 0 ? zone.tags : [zone.kind];
}

export function firstPlaceWithTag(
  pack: Pick<CountryPack, "route">,
  tag: string,
): RouteZone | null {
  return pack.route.zones.find((zone) => placeTagsOf(zone).includes(tag)) ?? null;
}
