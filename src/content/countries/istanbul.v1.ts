import { createPhase2CountryPack } from "./phase2-factory";

export const istanbulCountryPackV1 = createPhase2CountryPack({
  packId: "istanbul-v1", countryCode: "TR", countryName: "Turkey", cityName: "Istanbul", timeZone: "Europe/Istanbul",
  zones: [
    { id: "karakoy-arrival", label: "Karaköy and Galata", weather: "clear", palette: ["#68b1c8", "#dfc597", "#47646f"] },
    { id: "eminonu-waterfront", label: "Eminönü waterfront", weather: "breeze", palette: ["#74b7c2", "#ddc28c", "#456a68"] },
    { id: "spice-bazaar", label: "Spice Bazaar", weather: "haze", palette: ["#72a5b0", "#dca15f", "#675046"] },
    { id: "simit-tea", label: "Simit and tea", weather: "golden", palette: ["#91b4a9", "#e69e59", "#8e4c37"] },
    { id: "bosphorus-finale", label: "Bosphorus finale", weather: "evening", palette: ["#4d668c", "#c77a67", "#283a56"] },
  ],
  encounter: { npcId: "istanbul-host", locationLabel: "The Eminönü waterfront", phrase: { original: "Hoş geldiniz", transliteration: "Hoş geldiniz", gloss: "Welcome", pronunciation: "hosh gel-dee-NEEZ" }, exchange: ["Hoş geldiniz — welcome to Istanbul.", "I think I can hear three cities at once.", "That is only the first ferry arriving.", "Then I’ll keep walking until sunset."] },
  postcardTitle: "Seven days to the Bosphorus", postcardCopy: "We kept the traveler moving all the way to Istanbul and the Bosphorus.",
  sourceNotes: ["Finale route connects Karaköy, Eminönü, the Spice Bazaar and Bosphorus waterfront.", "Turkish phrase and pronunciation require native-speaker review."],
});
