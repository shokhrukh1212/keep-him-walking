import { createPhase3EditorialPack } from "./phase3-factory";
export const ljubljanaCountryPackV1 = createPhase3EditorialPack({
  packId: "ljubljana-v1", countryCode: "SI", countryName: "Slovenia", cityName: "Ljubljana", timeZone: "Europe/Ljubljana",
  zones: [
    { id: "preseren-arrival", label: "Prešeren Square", weather: "clear", palette: ["#7ebbd6", "#e8d09e", "#607d83"] },
    { id: "art-nouveau-river", label: "Riverside façades", weather: "breeze", palette: ["#82bacb", "#dec187", "#627364"] },
    { id: "central-market", label: "Central Market", weather: "haze", palette: ["#88b4b9", "#d8a165", "#70584b"] },
    { id: "river-cafe", label: "Ljubljanica café", weather: "golden", palette: ["#83ada9", "#d88e5b", "#785246"] },
    { id: "castle-evening", label: "Castle blue hour", weather: "evening", palette: ["#4f6b94", "#c87d71", "#33425e"] },
  ],
  encounter: { npcId: "ljubljana-host", locationLabel: "The Ljubljanica embankment", phrase: { original: "Dobrodošli", transliteration: "Dobrodošli", gloss: "Welcome", pronunciation: "doh-broh-DOH-shlee" }, exchange: ["Dobrodošli — welcome to Ljubljana.", "The river makes the whole route feel calm.", "Follow it and the old city opens slowly.", "That sounds like the right walking pace."] },
  postcardTitle: "Along the Ljubljanica", postcardCopy: "The shared walk followed Ljubljana’s river from the square to castle light.",
  sourceNotes: ["Unpublished editorial buffer route follows official Old Town walking guidance.", "Slovenian phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Visit Ljubljana — Explore the Old Town", url: "https://www.visitljubljana.com/en/visitors/sights-and-activities/explore-the-ljubljana-old-town/" }, { title: "Ljubljana Public Markets — Central Market", url: "https://www.lpt.si/en/marketplaces/descriptions-and-working-hours-of-marketplaces/ljubljana-central-market" }]);
