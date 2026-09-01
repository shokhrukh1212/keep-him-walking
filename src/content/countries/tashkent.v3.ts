import { countryPackSchema, type RouteProp } from "@/lib/content/schema";
import { tashkentCountryPackV2 } from "./tashkent.v2";

const zoneRoot = "/scenes/tashkent/v3/zones";
const propRoot = "/scenes/tashkent/v3/props";

function illustratedProp(
  id: string,
  kind: RouteProp["kind"],
  asset: string,
  depth: number,
  minGap: number,
  maxGap: number,
): RouteProp {
  return {
    id,
    kind,
    assetUrl: `${propRoot}/${asset}.webp`,
    depth,
    minGap,
    maxGap,
    colors: ["#315d4d", "#d9a75a"],
  };
}

const propsByZone: Record<string, RouteProp[]> = {
  "arrival-boulevard": [
    illustratedProp("arrival-plane-tree", "tree", "street-1", 0.64, 980, 1_360),
    illustratedProp("arrival-lamp", "lamp", "street-3", 0.88, 720, 980),
    illustratedProp("arrival-planter", "planter", "street-5", 1.02, 620, 900),
    illustratedProp("arrival-flower-bed", "planter", "street-6", 1.1, 820, 1_180),
  ],
  "mahalla-street": [
    illustratedProp("mahalla-tree", "tree", "street-2", 0.66, 920, 1_280),
    illustratedProp("mahalla-bench", "bench", "street-4", 0.9, 760, 1_060),
    illustratedProp("mahalla-pot", "planter", "street-5", 1.04, 580, 840),
    illustratedProp("mahalla-trellis", "awning", "market-5", 0.78, 1_080, 1_460),
  ],
  "chorsu-market": [
    illustratedProp("market-awning", "awning", "market-1", 0.7, 900, 1_220),
    illustratedProp("market-stall", "stall", "market-2", 0.86, 760, 1_020),
    illustratedProp("market-pots", "planter", "market-4", 1.04, 620, 860),
    illustratedProp("market-lantern", "lamp", "market-6", 0.94, 860, 1_120),
  ],
  "plov-cafe": [
    illustratedProp("cafe-table", "bench", "market-3", 0.9, 820, 1_120),
    illustratedProp("cafe-pots", "planter", "market-4", 1.06, 660, 940),
    illustratedProp("cafe-trellis", "awning", "market-5", 0.72, 1_120, 1_520),
    illustratedProp("cafe-lantern", "lamp", "market-6", 0.96, 840, 1_080),
  ],
  "evening-landmark": [
    illustratedProp("evening-plane-tree", "tree", "street-1", 0.62, 1_100, 1_480),
    illustratedProp("evening-lamp", "lamp", "street-3", 0.9, 700, 940),
    illustratedProp("evening-bench", "bench", "street-4", 1, 940, 1_260),
    illustratedProp("evening-flower-bed", "planter", "street-6", 1.08, 820, 1_100),
  ],
};

function panoramaLayer(zoneId: string) {
  return {
    id: "distant" as const,
    depth: 0.16,
    speed: 0.028,
    y: 0,
    height: 1,
    segments: [{
      id: `${zoneId}-panorama`,
      url: `${zoneRoot}/${zoneId}/panorama.webp`,
      worldWidth: 2_400,
    }],
  };
}

function groundLayer(zoneId: string) {
  return {
    id: "ground" as const,
    depth: 0.96,
    speed: 1,
    y: 0.78,
    height: 0.22,
    segments: [1, 2, 3].map((variant) => ({
      id: `${zoneId}-ground-${variant}`,
      url: `${zoneRoot}/${zoneId}/ground-${variant}.webp`,
      worldWidth: 1_200,
    })),
  };
}

export const tashkentCountryPackV3 = countryPackSchema.parse({
  ...tashkentCountryPackV2,
  assetVersion: "tashkent-v3",
  scene: {
    ...tashkentCountryPackV2.scene,
    fallbackUrl: `${zoneRoot}/arrival-boulevard/fallback.webp`,
    layers: [
      { id: "sky", url: `${zoneRoot}/arrival-boulevard/panorama.webp`, depth: 0.08, speed: 0.028 },
      { id: "city", url: `${zoneRoot}/mahalla-street/panorama.webp`, depth: 0.46, speed: 0.28 },
      { id: "street", url: `${zoneRoot}/arrival-boulevard/ground-1.webp`, depth: 0.9, speed: 1 },
    ],
  },
  route: {
    ...tashkentCountryPackV2.route,
    zones: tashkentCountryPackV2.route.zones.map((zone) => ({
      ...zone,
      layers: [panoramaLayer(zone.id), groundLayer(zone.id)],
      props: propsByZone[zone.id],
      fallbackUrl: `${zoneRoot}/${zone.id}/fallback.webp`,
    })),
  },
  postcardBackgroundUrl: "/postcards/tashkent/v3/background.webp",
  preload: [
    `${zoneRoot}/arrival-boulevard/panorama.webp`,
    `${zoneRoot}/arrival-boulevard/ground-1.webp`,
    `${propRoot}/street-1.webp`,
    `${propRoot}/street-3.webp`,
    "/traveler/temporary/v2/walk-1.webp",
    "/traveler/temporary/v2/walk-2.webp",
  ],
});
