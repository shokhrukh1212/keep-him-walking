import { createPhase2CountryPack } from "./phase2-factory";

export const almatyCountryPackV1 = createPhase2CountryPack({
  packId: "almaty-v1", countryCode: "KZ", countryName: "Kazakhstan", cityName: "Almaty", timeZone: "Asia/Almaty",
  zones: [
    { id: "arbat-arrival", label: "Arbat promenade", weather: "clear", palette: ["#76b7ca", "#e2ca97", "#496670"] },
    { id: "panfilov-park", label: "Panfilov Park", weather: "breeze", palette: ["#83bdc4", "#dec98e", "#426b56"] },
    { id: "green-bazaar", label: "Green Bazaar", weather: "haze", palette: ["#73aab8", "#dcaa68", "#315963"] },
    { id: "apple-cafe", label: "Apple café", weather: "golden", palette: ["#96b9af", "#e9aa62", "#8c513b"] },
    { id: "medeu-evening", label: "Medeu foothills", weather: "evening", palette: ["#506b8f", "#ce8466", "#293d5c"] },
  ],
  encounter: { npcId: "almaty-host", locationLabel: "Panfilov Park", phrase: { original: "Қош келдіңіз", transliteration: "Qosh keldiñiz", gloss: "Welcome", pronunciation: "qosh kel-dih-NIZ" }, exchange: ["Qosh keldiñiz — welcome to Almaty.", "I can smell apples near the market.", "The city’s old name remembers them too.", "Then I should follow that scent."] },
  postcardTitle: "Almaty, city of apples", postcardCopy: "We kept walking from the Arbat to the foothills above Almaty.",
  sourceNotes: ["Route references the Arbat, Panfilov Park, Green Bazaar and Medeu foothills.", "Kazakh phrase and pronunciation require native-speaker review."],
});
