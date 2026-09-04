import { createPhase3EditorialPack } from "./phase3-factory";
export const pragueCountryPackV1 = createPhase3EditorialPack({
  packId: "prague-v1", countryCode: "CZ", countryName: "Czechia", cityName: "Prague", timeZone: "Europe/Prague",
  zones: [
    { id: "old-town-arrival", label: "Old Town Square", weather: "clear", palette: ["#78b6d4", "#e8ce9a", "#617980"] },
    { id: "historic-lanes", label: "Old Town lanes", weather: "breeze", palette: ["#81b7c9", "#dfbb80", "#69705c"] },
    { id: "havelske-market", label: "Havelské tržiště", weather: "haze", palette: ["#86b2b7", "#d79c62", "#735348"] },
    { id: "vltava-cafe", label: "Vltava café", weather: "golden", palette: ["#84aaa6", "#d78d5a", "#7b5043"] },
    { id: "charles-bridge-evening", label: "Charles Bridge evening", weather: "evening", palette: ["#4d678e", "#c87b6d", "#334059"] },
  ],
  encounter: { npcId: "prague-host", locationLabel: "Old Town Square", phrase: { original: "Vítejte", transliteration: "Vítejte", gloss: "Welcome", pronunciation: "VEE-tay-teh" }, exchange: ["Vítejte — welcome to Prague.", "The route seems older with every corner.", "These streets have carried travelers for centuries.", "Today they’re carrying one more."] },
  postcardTitle: "Prague after the lamps glow", postcardCopy: "The shared walk reached Charles Bridge beneath Prague’s evening skyline.",
  sourceNotes: ["Unpublished editorial buffer route follows official Prague City Tourism landmarks.", "Czech phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Prague City Tourism — Old Town Square", url: "https://prague.eu/en/objevujte/old-town-square-staromestske-namesti/" }, { title: "Prague City Tourism — Charles Bridge", url: "https://prague.eu/en/objevujte/charles-bridge-karluv-most/" }]);
