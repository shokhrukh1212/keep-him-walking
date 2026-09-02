import { createPhase2CountryPack } from "./phase2-factory";

export const tbilisiCountryPackV1 = createPhase2CountryPack({
  packId: "tbilisi-v1", countryCode: "GE", countryName: "Georgia", cityName: "Tbilisi", timeZone: "Asia/Tbilisi",
  zones: [
    { id: "rustaveli-arrival", label: "Rustaveli Avenue", weather: "clear", palette: ["#70b2c5", "#e1c291", "#52646d"] },
    { id: "balcony-lanes", label: "Wooden balcony lanes", weather: "breeze", palette: ["#82b8bc", "#dfbd89", "#755947"] },
    { id: "dry-bridge", label: "Dry Bridge market", weather: "haze", palette: ["#75a7b3", "#d8a365", "#4b5558"] },
    { id: "bakery-courtyard", label: "Bakery courtyard", weather: "golden", palette: ["#92b3aa", "#e4a15e", "#8b4d39"] },
    { id: "abanotubani-evening", label: "Abanotubani and Narikala", weather: "evening", palette: ["#4f6688", "#c87c67", "#2c3b55"] },
  ],
  encounter: { npcId: "tbilisi-host", locationLabel: "A carved balcony", phrase: { original: "კეთილი იყოს თქვენი მობრძანება", transliteration: "Ketili iqos tkveni mobrdzaneba", gloss: "Welcome", pronunciation: "keh-TEE-lee EE-khos tkveh-nee mobr-dzah-NEH-bah" }, exchange: ["Ketili iqos tkveni mobrdzaneba — welcome.", "Every balcony seems to be telling a story.", "Stay long enough and someone will tell you one.", "I have a few streets left to listen."] },
  postcardTitle: "Tbilisi in warm light", postcardCopy: "We followed Tbilisi’s balconies and sulfur-bath domes toward Narikala.",
  sourceNotes: ["Route references Rustaveli, Dry Bridge, courtyard bakeries and Abanotubani.", "Georgian phrase and pronunciation require native-speaker review."],
});
