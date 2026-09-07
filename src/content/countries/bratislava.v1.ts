import { createPhase3EditorialPack } from "./phase3-factory";
export const bratislavaCountryPackV1 = createPhase3EditorialPack({
  packId: "bratislava-v1", countryCode: "SK", countryName: "Slovakia", cityName: "Bratislava", timeZone: "Europe/Bratislava",
  zones: [
    { id: "michaels-gate", label: "Michael’s Gate", weather: "clear", palette: ["#7cb9d5", "#ead09d", "#637a82"] },
    { id: "pastel-old-town", label: "Pastel Old Town", weather: "breeze", palette: ["#83b9cb", "#e0bd83", "#6a715e"] },
    { id: "old-market", label: "Old Market Hall", weather: "haze", palette: ["#87b3b8", "#d99d63", "#74554a"] },
    { id: "danube-cafe", label: "Danube café", weather: "golden", palette: ["#85aaa7", "#d88e5b", "#7d5144"] },
    { id: "castle-evening", label: "Castle above the Danube", weather: "evening", palette: ["#506a92", "#ca7d70", "#35415b"] },
  ],
  encounter: { npcId: "bratislava-host", locationLabel: "Michael’s Gate", phrase: { original: "Vitajte", transliteration: "Vitajte", gloss: "Welcome", pronunciation: "VEE-tie-teh" }, exchange: ["Vitajte — welcome to Bratislava.", "The old town feels close to the river.", "The castle keeps both in view.", "I’ll follow that line into evening."] },
  postcardTitle: "Bratislava above the Danube", postcardCopy: "The shared walk crossed the Old Town and reached the castle at blue hour.",
  sourceNotes: ["Unpublished editorial buffer route follows official first-time visitor landmarks.", "Slovak phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Visit Bratislava — First-timer itinerary", url: "https://www.visitbratislava.com/bratislava-in-2-days-for-first-timers/" }, { title: "Visit Bratislava — Bratislava Castle", url: "https://www.visitbratislava.com/places/bratislava-castle/" }]);
