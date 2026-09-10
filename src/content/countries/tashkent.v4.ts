import { createPhase2CountryPack } from "./phase2-factory";

export const tashkentCountryPackV4 = createPhase2CountryPack({
  packId: "tashkent-v4",
  countryCode: "UZ",
  countryName: "Uzbekistan",
  cityName: "Tashkent",
  timeZone: "Asia/Tashkent",
  zones: [
    { id: "arrival-boulevard", label: "Arrival boulevard", weather: "clear", palette: ["#70b6ca", "#d9c68d", "#315c63"], stage: { groundLineY: 0.86, horizonY: 0.73, personHeightFrac: 0.21, palette: ["#c4b394", "#79825c", "#566879"], lightDir: "left" } },
    { id: "mahalla-street", label: "Mahalla street", weather: "breeze", palette: ["#81bcc5", "#e5c58a", "#3f675f"], stage: { groundLineY: 0.87, horizonY: 0.66, personHeightFrac: 0.18, palette: ["#c7b38f", "#7d855b", "#536579"], lightDir: "left" } },
    { id: "chorsu-market", label: "Chorsu market", weather: "haze", palette: ["#78aeb8", "#e0b66f", "#285b66"], stage: { groundLineY: 0.85, horizonY: 0.64, personHeightFrac: 0.21, palette: ["#c2ac84", "#78805a", "#4f6575"], lightDir: "left" } },
    { id: "plov-cafe", label: "Plov café", weather: "golden", palette: ["#91b9b0", "#edae64", "#995b3d"], stage: { groundLineY: 0.85, horizonY: 0.60, personHeightFrac: 0.19, palette: ["#c4a87f", "#7f8054", "#59677a"], lightDir: "left" } },
    { id: "evening-landmark", label: "Hazrati Imam at dusk", weather: "evening", palette: ["#516b8d", "#d38a66", "#243653"], stage: { groundLineY: 0.88, horizonY: 0.64, personHeightFrac: 0.20, palette: ["#ad8a76", "#7e6b61", "#444e69"], lightDir: "right" } },
  ],
  ambient: { season: "summer", tram: true, catColor: "#c8b393" },
  encounter: {
    npcId: "tashkent-host",
    locationLabel: "A mahalla gate",
    phrase: { original: "Xush kelibsiz", transliteration: "Xush kelibsiz", gloss: "Welcome", pronunciation: "khoosh keh-LEEB-seez" },
    exchange: ["Xush kelibsiz — welcome to Tashkent.", "Rahmat. I’m walking only because people are here.", "Then let the city carry you a little farther.", "I’ll remember that at the next corner."],
  },
  postcardTitle: "A day in Tashkent",
  postcardCopy: "We kept the traveler moving through Tashkent.",
  sourceNotes: ["Tashkent route motifs derive from the reviewed Phase 1.5 visual direction.", "Shokhrukh Karimov approved the pack on September 2, 2026 with no corrections currently requested."],
});
