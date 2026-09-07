import { createPhase3EditorialPack } from "./phase3-factory";
export const sofiaCountryPackV1 = createPhase3EditorialPack({
  packId: "sofia-v1", countryCode: "BG", countryName: "Bulgaria", cityName: "Sofia", timeZone: "Europe/Sofia",
  zones: [
    { id: "nevsky-arrival", label: "Alexander Nevsky arrival", weather: "clear", palette: ["#79b8d8", "#ead3a1", "#627d85"] },
    { id: "yellow-stones", label: "Yellow-stone boulevard", weather: "breeze", palette: ["#81bdd5", "#e6c684", "#6a725d"] },
    { id: "central-market", label: "Central Market Hall", weather: "haze", palette: ["#86b8c6", "#dca465", "#74554a"] },
    { id: "banitsa-cafe", label: "Banitsa café", weather: "golden", palette: ["#8cb4ae", "#dc965d", "#7f5546"] },
    { id: "vitosha-evening", label: "Vitosha evening", weather: "evening", palette: ["#556d9b", "#d27f70", "#34405f"] },
  ],
  encounter: { npcId: "sofia-host", locationLabel: "The yellow-stone boulevard", phrase: { original: "Добре дошли", transliteration: "Dobre doshli", gloss: "Welcome", pronunciation: "DOH-breh DOH-shlee" }, exchange: ["Добре дошли — welcome to Sofia.", "The mountain feels close enough to guide the route.", "Vitosha is never far from the city’s view.", "Then let’s walk toward the evening light."] },
  postcardTitle: "Sofia beneath Vitosha", postcardCopy: "The shared walk reached Sofia’s boulevards, market and mountain light.",
  sourceNotes: ["Unpublished Days 8–14 editorial buffer; route follows official Sofia tourism landmarks.", "Bulgarian phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Visit Sofia — Discover Sofia", url: "https://visitsofia.bg/catalog/en/discover_sofiaEN/Discover_SofiaEN.pdf" }, { title: "Sofia Municipality — Central Sofia Market Hall", url: "https://www.sofia.bg/en/web/sofia-municipality/w/the-central-sofia-market-hall-511027" }]);
