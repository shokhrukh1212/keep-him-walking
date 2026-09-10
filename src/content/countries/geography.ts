/**
 * Where each city is and which registered packs it shares a real land border
 * with. Neighbours are pack ids, listed only where an actual land border exists
 * between the two countries — the destination vote must never invent one.
 *
 * Kept in one file so the borders can be reviewed together rather than hunted
 * through sixteen pack definitions.
 */
export type PackGeography = {
  lat: number;
  lon: number;
  neighbours: string[];
  voteBlurb: string;
};

export const PACK_GEOGRAPHY: Record<string, PackGeography> = {
  "tashkent-v4": {
    lat: 41.2995,
    lon: 69.2401,
    neighbours: ["almaty-v1", "bishkek-v1", "dushanbe-v1"],
    voteBlurb: "Wide boulevards, blue-tiled domes and the busiest bazaar in Central Asia.",
  },
  "dushanbe-v1": {
    lat: 38.5598,
    lon: 68.787,
    neighbours: ["tashkent-v4", "bishkek-v1"],
    voteBlurb: "A green capital under the Pamir mountains, built around teahouses and poplars.",
  },
  "bishkek-v1": {
    lat: 42.8746,
    lon: 74.5698,
    neighbours: ["almaty-v1", "tashkent-v4", "dushanbe-v1"],
    voteBlurb: "Soviet grid streets with the Ala-Too range standing at the end of every avenue.",
  },
  "almaty-v1": {
    lat: 43.2389,
    lon: 76.8897,
    neighbours: ["bishkek-v1", "tashkent-v4"],
    voteBlurb: "Apple orchards, mountain air and a city that climbs toward the snow line.",
  },
  "baku-v1": {
    lat: 40.4093,
    lon: 49.8671,
    neighbours: ["tbilisi-v1", "istanbul-v1"],
    voteBlurb: "A walled old city on the Caspian, wrapped in wind and limestone.",
  },
  "tbilisi-v1": {
    lat: 41.7151,
    lon: 44.8271,
    neighbours: ["baku-v1", "istanbul-v1"],
    voteBlurb: "Carved balconies above sulphur baths, in a valley the Mtkvari cuts in half.",
  },
  "istanbul-v1": {
    lat: 41.0082,
    lon: 28.9784,
    neighbours: ["sofia-v1", "tbilisi-v1", "baku-v1"],
    voteBlurb: "Ferries between two continents, and a skyline of domes and minarets.",
  },
  "sofia-v1": {
    lat: 42.6977,
    lon: 23.3219,
    neighbours: ["istanbul-v1", "belgrade-v1"],
    voteBlurb: "Roman ruins under the pavement and Vitosha mountain at the end of the street.",
  },
  "belgrade-v1": {
    lat: 44.7866,
    lon: 20.4489,
    neighbours: ["sofia-v1", "zagreb-v1"],
    voteBlurb: "A fortress where the Sava meets the Danube, above a city that never quite sleeps.",
  },
  "zagreb-v1": {
    lat: 45.815,
    lon: 15.9819,
    neighbours: ["ljubljana-v1", "belgrade-v1"],
    voteBlurb: "An upper town of gas lamps and tiled roofs above a café-lined lower town.",
  },
  "ljubljana-v1": {
    lat: 46.0569,
    lon: 14.5058,
    neighbours: ["zagreb-v1", "vienna-v1"],
    voteBlurb: "A castle hill, a green river and a centre small enough to cross on foot.",
  },
  "vienna-v1": {
    lat: 48.2082,
    lon: 16.3738,
    neighbours: ["prague-v1", "bratislava-v1", "ljubljana-v1"],
    voteBlurb: "Imperial avenues, coffee houses, and the Danube on the edge of it all.",
  },
  "bratislava-v1": {
    lat: 48.1486,
    lon: 17.1077,
    neighbours: ["prague-v1", "vienna-v1"],
    voteBlurb: "A compact old town beneath a white castle, an hour downriver from Vienna.",
  },
  "prague-v1": {
    lat: 50.0755,
    lon: 14.4378,
    neighbours: ["bratislava-v1", "vienna-v1"],
    voteBlurb: "Bridges over the Vltava, and a hundred spires above the red rooftops.",
  },
};

const EMPTY_GEOGRAPHY: PackGeography = { lat: 0, lon: 0, neighbours: [], voteBlurb: "" };

export function packGeography(packId: string): PackGeography {
  return PACK_GEOGRAPHY[packId] ?? EMPTY_GEOGRAPHY;
}
