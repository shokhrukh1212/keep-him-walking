import { createPhase3EditorialPack } from "./phase3-factory";
export const viennaCountryPackV1 = createPhase3EditorialPack({
  packId: "vienna-v1", countryCode: "AT", countryName: "Austria", cityName: "Vienna", timeZone: "Europe/Vienna",
  zones: [
    { id: "ringstrasse-arrival", label: "Ringstrasse arrival", weather: "clear", palette: ["#7cb9d6", "#ead19e", "#637b83"] },
    { id: "stephansplatz-lanes", label: "Old-city lanes", weather: "breeze", palette: ["#84b9cb", "#e0bf85", "#6c705d"] },
    { id: "naschmarkt", label: "Naschmarkt", weather: "haze", palette: ["#88b4b9", "#d9a064", "#74554a"] },
    { id: "coffeehouse", label: "Viennese coffeehouse", weather: "golden", palette: ["#88aca7", "#d9915b", "#7d5144"] },
    { id: "belvedere-evening", label: "Belvedere evening", weather: "evening", palette: ["#536b91", "#cb806f", "#36415a"] },
  ],
  encounter: { npcId: "vienna-host", locationLabel: "A Ringstrasse coffeehouse", phrase: { original: "Willkommen", transliteration: "Willkommen", gloss: "Welcome", pronunciation: "VIL-koh-men" }, exchange: ["Willkommen — welcome to Vienna.", "Is the coffee break part of the route?", "Here, taking time can be part of the day.", "Then the internet can keep me walking afterward."] },
  postcardTitle: "Vienna at walking pace", postcardCopy: "The shared walk crossed Vienna from the Ring to an evening garden.",
  sourceNotes: ["Unpublished editorial buffer route uses official Vienna tourism walking and market material.", "German dialogue and all cultural details require qualified local review before publication."],
}, [{ title: "Vienna Tourism — Ringstrasse", url: "https://www.wien.info/en/art-culture/ringstrasse" }, { title: "Vienna Tourism — Naschmarkt", url: "https://www.wien.info/en/dine-drink/markets/naschmarkt-353536" }, { title: "Vienna Tourism — Traditional coffee houses", url: "https://www.wien.info/en/dine-drink/coffeehouses/top-traditional-coffee-houses-in-vienna-361666" }]);
