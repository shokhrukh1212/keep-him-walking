import { createPhase2CountryPack } from "./phase2-factory";

export const bishkekCountryPackV1 = createPhase2CountryPack({
  packId: "bishkek-v1", countryCode: "KG", countryName: "Kyrgyzstan", cityName: "Bishkek", timeZone: "Asia/Bishkek",
  zones: [
    { id: "ala-too-arrival", label: "Ala-Too Square", weather: "clear", palette: ["#76b8cf", "#dfca9a", "#506873"] },
    { id: "erkindik-boulevard", label: "Erkindik Boulevard", weather: "breeze", palette: ["#81bcc3", "#dacb91", "#3f6b57"] },
    { id: "osh-bazaar", label: "Osh Bazaar", weather: "haze", palette: ["#78acb9", "#dda968", "#345b61"] },
    { id: "boorsok-tea", label: "Boorsok and tea", weather: "golden", palette: ["#98b9b3", "#e6aa62", "#865039"] },
    { id: "mountain-evening", label: "Ala-Too mountain view", weather: "evening", palette: ["#536b8c", "#cb8569", "#293e5b"] },
  ],
  encounter: { npcId: "bishkek-host", locationLabel: "Erkindik Boulevard", phrase: { original: "Кош келиңиз", transliteration: "Kosh keliñiz", gloss: "Welcome", pronunciation: "kosh keh-lee-NGIZ" }, exchange: ["Kosh keliñiz — welcome to Bishkek.", "The mountains seem to follow every street.", "They do. Have tea before you walk toward them.", "That sounds like excellent route advice."] },
  postcardTitle: "Bishkek and the Ala-Too", postcardCopy: "We walked from the city’s leafy boulevards toward the mountain horizon.",
  sourceNotes: ["Route distinguishes Ala-Too Square, Erkindik Boulevard and Osh Bazaar.", "Kyrgyz orthography and pronunciation require native-speaker review."],
});
