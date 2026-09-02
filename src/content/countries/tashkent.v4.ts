import { createPhase2CountryPack } from "./phase2-factory";

export const tashkentCountryPackV4 = createPhase2CountryPack({
  packId: "tashkent-v4",
  countryCode: "UZ",
  countryName: "Uzbekistan",
  cityName: "Tashkent",
  timeZone: "Asia/Tashkent",
  zones: [
    { id: "arrival-boulevard", label: "Arrival boulevard", weather: "clear", palette: ["#70b6ca", "#d9c68d", "#315c63"] },
    { id: "mahalla-street", label: "Mahalla street", weather: "breeze", palette: ["#81bcc5", "#e5c58a", "#3f675f"] },
    { id: "chorsu-market", label: "Chorsu market", weather: "haze", palette: ["#78aeb8", "#e0b66f", "#285b66"] },
    { id: "plov-cafe", label: "Plov café", weather: "golden", palette: ["#91b9b0", "#edae64", "#995b3d"] },
    { id: "evening-landmark", label: "Hazrati Imam at dusk", weather: "evening", palette: ["#516b8d", "#d38a66", "#243653"] },
  ],
  encounter: {
    npcId: "tashkent-host",
    locationLabel: "A mahalla gate",
    phrase: { original: "Xush kelibsiz", transliteration: "Xush kelibsiz", gloss: "Welcome", pronunciation: "khoosh keh-LEEB-seez" },
    exchange: ["Xush kelibsiz — welcome to Tashkent.", "Rahmat. I’m walking only because people are here.", "Then let the city carry you a little farther.", "I’ll remember that at the next corner."],
  },
  postcardTitle: "A day in Tashkent",
  postcardCopy: "We kept the traveler moving through Tashkent.",
  sourceNotes: ["Tashkent route motifs derive from the reviewed Phase 1.5 visual direction.", "Local phrases remain pending independent native-speaker review."],
});
