import { countryPackSchema } from "@/lib/content/schema";

export const PHASE1_COUNTRY_DAY_ID = "10000000-0000-4000-8000-000000000001";
export const PHASE1_ENCOUNTER_ID = "20000000-0000-4000-8000-000000000001";

export const tashkentCountryPack = countryPackSchema.parse({
  schemaVersion: 1,
  assetVersion: "tashkent-v1",
  countryDayId: PHASE1_COUNTRY_DAY_ID,
  countryCode: "UZ",
  countryName: "Uzbekistan",
  cityName: "Tashkent",
  timeZone: "Asia/Tashkent",
  scene: {
    fallbackUrl: "/scenes/tashkent/v1/scene-fallback.webp",
    layers: [
      {
        id: "sky",
        url: "/scenes/tashkent/v1/sky.webp",
        depth: 0.05,
        speed: 0.04,
      },
      {
        id: "city",
        url: "/scenes/tashkent/v1/city.webp",
        depth: 0.34,
        speed: 0.12,
      },
      {
        id: "street",
        url: "/scenes/tashkent/v1/street.webp",
        depth: 0.68,
        speed: 0.28,
      },
      {
        id: "foreground",
        url: "/scenes/tashkent/v1/foreground.webp",
        depth: 1,
        speed: 0.48,
        scale: 1.03,
      },
    ],
    palette: {
      day: ["#8ccfd1", "#f0c37a", "#d77550"],
      night: ["#132937", "#294956", "#dca15d"],
    },
  },
  traveler: {
    riveUrl: null,
    artboard: "Traveler",
    stateMachine: "TravelerState",
    fallbackSprites: {
      loading: "/traveler/temporary/v1/idle.webp",
      idle: "/traveler/temporary/v1/idle.webp",
      walk: "/traveler/temporary/v1/walk.webp",
      notice: "/traveler/temporary/v1/phone.webp",
      approach: "/traveler/temporary/v1/walk.webp",
      talk: "/traveler/temporary/v1/wave.webp",
      listen: "/traveler/temporary/v1/idle.webp",
      react: "/traveler/temporary/v1/wave.webp",
      wave: "/traveler/temporary/v1/wave.webp",
      phone: "/traveler/temporary/v1/phone.webp",
      drink: "/traveler/temporary/v1/drink.webp",
      photo: "/traveler/temporary/v1/photo.webp",
      sit: "/traveler/temporary/v1/idle.webp",
      goodbye: "/traveler/temporary/v1/wave.webp",
      resume_walk: "/traveler/temporary/v1/walk.webp",
    },
  },
  npcAssets: {
    neutral: "/npcs/tashkent-chef/v1/neutral.webp",
    talk: "/npcs/tashkent-chef/v1/talk.webp",
    react: "/npcs/tashkent-chef/v1/react.webp",
  },
  audio: [],
  ambientActions: [
    { state: "wave", label: "Waving to a passerby" },
    { state: "phone", label: "Checking the route" },
    { state: "drink", label: "Taking a water break" },
    { state: "photo", label: "Photographing the city" },
  ],
  encounters: [
    {
      id: PHASE1_ENCOUNTER_ID,
      npcId: "tashkent-chef",
      locationLabel: "Near Chorsu Bazaar",
      lines: [
        {
          speaker: "traveler",
          mood: "curious",
          text: "Excuse me—what should I try while I’m in Tashkent?",
          durationMs: 5_500,
        },
        {
          speaker: "npc",
          mood: "surprised",
          text: "You haven’t eaten plov yet?",
          durationMs: 4_500,
        },
        {
          speaker: "traveler",
          mood: "amused",
          text: "Not yet. Is that a problem?",
          durationMs: 4_800,
        },
        {
          speaker: "npc",
          mood: "amused",
          text: "A very serious problem. Follow me.",
          durationMs: 5_200,
        },
      ],
      nextStoryBeatId: "visit-plov-restaurant",
    },
  ],
  preload: [
    "/scenes/tashkent/v1/sky.webp",
    "/scenes/tashkent/v1/city.webp",
    "/scenes/tashkent/v1/street.webp",
    "/traveler/temporary/v1/walk.webp",
    "/traveler/temporary/v1/idle.webp",
  ],
});
