import { createPhase3EditorialPack } from "./phase3-factory";
export const zagrebCountryPackV1 = createPhase3EditorialPack({
  packId: "zagreb-v1", countryCode: "HR", countryName: "Croatia", cityName: "Zagreb", timeZone: "Europe/Zagreb",
  zones: [
    { id: "jelacic-arrival", label: "Ban Jelačić Square", weather: "clear", palette: ["#79b8d8", "#ead09b", "#617b82"] },
    { id: "upper-town", label: "Upper Town lanes", weather: "breeze", palette: ["#82b9ce", "#e1bb81", "#6b705c"] },
    { id: "dolac-market", label: "Dolac Market", weather: "haze", palette: ["#88b5bc", "#dba064", "#765348"] },
    { id: "cafe-street", label: "Zagreb café street", weather: "golden", palette: ["#8aadaa", "#db905c", "#805145"] },
    { id: "strossmayer-evening", label: "Strossmayer evening", weather: "evening", palette: ["#536d94", "#ce8172", "#38415b"] },
  ],
  encounter: { npcId: "zagreb-host", locationLabel: "Dolac Market", phrase: { original: "Dobro došli", transliteration: "Dobro došli", gloss: "Welcome", pronunciation: "DOH-broh DOH-shlee" }, exchange: ["Dobro došli — welcome to Zagreb.", "The red umbrellas found me before the map did.", "Dolac has guided mornings here for generations.", "Then it’s the right place to pause and listen."] },
  postcardTitle: "Zagreb under red roofs", postcardCopy: "The shared walk climbed from Dolac to Zagreb’s evening promenade.",
  sourceNotes: ["Unpublished editorial buffer route covers central Zagreb and Upper Town.", "Croatian phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Visit Zagreb — Dolac Market", url: "https://www.visitzagreb.hr/hr/zagreb/dolac-market/" }, { title: "Visit Zagreb — Strossmayer Promenade", url: "https://visitzagreb.com/what-to-do/landmarks/strossmayer-promenade/" }]);
