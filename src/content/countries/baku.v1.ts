import { createPhase2CountryPack } from "./phase2-factory";

export const bakuCountryPackV1 = createPhase2CountryPack({
  packId: "baku-v1", countryCode: "AZ", countryName: "Azerbaijan", cityName: "Baku", timeZone: "Asia/Baku",
  zones: [
    { id: "seaside-arrival", label: "Seaside Boulevard", weather: "clear", palette: ["#69b5cb", "#d7c89c", "#3d6874"] },
    { id: "icherisheher", label: "Icherisheher lanes", weather: "breeze", palette: ["#7eb9c0", "#dec08c", "#735b47"] },
    { id: "old-city-market", label: "Old City market", weather: "haze", palette: ["#72a9b5", "#dda768", "#4d5558"] },
    { id: "armudu-tea", label: "Armudu tea room", weather: "golden", palette: ["#91b6ae", "#e8a45f", "#8c4e38"] },
    { id: "flame-evening", label: "Flame Towers skyline", weather: "evening", palette: ["#4d668d", "#c97b68", "#283954"] },
  ],
  encounter: { npcId: "baku-host", locationLabel: "An Icherisheher doorway", phrase: { original: "Xoş gəlmisiniz", transliteration: "Xosh gelmisiniz", gloss: "Welcome", pronunciation: "khosh gel-mee-see-NIZ" }, exchange: ["Xoş gəlmisiniz — welcome to Baku.", "The wind has been guiding me from the sea.", "In this city, it usually does.", "I’ll let it choose the next lane."] },
  postcardTitle: "Baku, city of wind", postcardCopy: "We crossed Baku from the Caspian promenade to the evening skyline.",
  sourceNotes: ["Route contrasts the Caspian boulevard, Icherisheher stone lanes and contemporary skyline.", "Azerbaijani phrase and pronunciation require native-speaker review."],
});
