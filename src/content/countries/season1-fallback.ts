import { countryPackV3Schema, type CountryPackV3 } from "@/lib/content/schema";
import { SEASON_ONE_ROUTE } from "@/lib/season/anniversary";
import { SEASON_SCENE_FALLBACK } from "@/lib/season/asset-manifest";
import { parisCountryPackV3 } from "./paris.v3";

/**
 * Metadata-only city packs while four city paintings are absent. Their sole place is
 * visibly the generic fallback; no Paris art, phrase, landmark or dialogue leaks in.
 * The pending review state keeps them out of destination voting.
 */
export const SEASON_ONE_FALLBACK_IDS = new Set(["brussels-v1", "amsterdam-v1", "cologne-v1", "budapest-v1"]);

function fallbackPack(stop: (typeof SEASON_ONE_ROUTE)[number]): CountryPackV3 {
  const id = stop.packId;
  const sceneZone = parisCountryPackV3.route.zones[0]!;
  const zoneId = `${id.replace(/-v\d+$/, "")}-virtual-preview`;
  const encounterId = `${zoneId}-hello`;
  const zone = {
    ...sceneZone,
    id: zoneId,
    label: "Illustrated virtual route",
    description: `City artwork for ${stop.city} is being prepared. This is a generic illustrated fallback.`,
    tags: ["arrival", "lanes", "cafe", "landmark"],
    props: sceneZone.props.map((prop) => ({ ...prop, id: `${zoneId}-${prop.kind}`, assetUrl: undefined })),
    audioIds: [],
    fallbackUrl: SEASON_SCENE_FALLBACK,
    layers: sceneZone.layers.map((layer) => ({
      ...layer,
      segments: layer.segments.map((segment) => ({ ...segment, id: `${zoneId}-${layer.id}`, url: SEASON_SCENE_FALLBACK })),
    })),
    continuousScene: undefined,
    variants: undefined,
    nightUrl: undefined,
    lightsUrl: undefined,
  };
  return countryPackV3Schema.parse({
    ...parisCountryPackV3,
    packId: id,
    assetVersion: id,
    revision: 1,
    countryCode: stop.code,
    countryName: stop.country,
    cityName: stop.city,
    timeZone: stop.timeZone,
    lat: stop.lat,
    lon: stop.lon,
    neighbours: [],
    voteBlurb: `A virtual stop in ${stop.city}; city artwork is being prepared.`,
    scene: {
      ...parisCountryPackV3.scene,
      fallbackUrl: SEASON_SCENE_FALLBACK,
      layers: parisCountryPackV3.scene.layers.map((layer) => ({ ...layer, url: SEASON_SCENE_FALLBACK })),
    },
    npcAssets: {},
    audio: [],
    encounters: [{
      id: encounterId, npcId: `${zoneId}-resident`, locationLabel: "The virtual route",
      lines: [
        { speaker: "npc", text: "Hello.", mood: "neutral" },
        { speaker: "traveler", text: "Hello. We’re continuing the virtual journey.", mood: "neutral" },
      ],
    }],
    preload: [SEASON_SCENE_FALLBACK],
    route: { ...parisCountryPackV3.route, zones: [zone] },
    postcardBackgroundUrl: SEASON_SCENE_FALLBACK,
    postcard: {
      ...parisCountryPackV3.postcard,
      title: `${stop.city} on the virtual route`,
      safeCopy: `The shared virtual journey reached ${stop.city}. City artwork is being prepared.`,
    },
    preloadGroups: [
      { id: `${zoneId}-critical`, timing: "critical", zoneId, assets: [SEASON_SCENE_FALLBACK] },
      { id: `${zoneId}-next`, timing: "next_zone", zoneId, assets: [SEASON_SCENE_FALLBACK] },
    ],
    storyBeats: parisCountryPackV3.storyBeats.map((beat) => ({
      ...beat,
      id: `${zoneId}-${beat.kind}`,
      title: beat.kind === "departure" ? "Until tomorrow" : "Virtual journey",
      summary: beat.kind === "departure" ? "The virtual route continues tomorrow." : `The virtual route reaches ${stop.city}.`,
      ...(beat.kind === "encounter" ? { encounterId } : {}),
    })),
    localPhrases: [{ original: "Hello", transliteration: "Hello", gloss: "Hello", pronunciation: "heh-LOH" }],
    culturalReview: {
      reviewerName: null, reviewedAt: null, status: "pending",
      qualification: null, disposition: null, publicLaunchRequirement: null, citations: [],
      notes: "Generic virtual fallback only. No city-specific visual or cultural review has been claimed.",
    },
    resident: { name: "Visitor", role: "Virtual route companion", variantId: "resident-a" },
    conversations: [],
    npcSystem: { baseType: "resident-a", variantId: "resident-a", states: {} },
    editorial: {
      owner: "Season 1 route fallback", researchedAt: "2026-09-16T00:00:00.000Z",
      sourceNotes: ["City art is missing; only the generic fallback is shown.", "No city-specific cultural claims are published."],
    },
  });
}

export const seasonOneFallbackPacks = SEASON_ONE_ROUTE
  .filter((stop) => SEASON_ONE_FALLBACK_IDS.has(stop.packId))
  .map(fallbackPack);
