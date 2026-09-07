import { createPhase2CountryPack } from "./phase2-factory";

export const dushanbeCountryPackV1 = createPhase2CountryPack({
  packId: "dushanbe-v1", countryCode: "TJ", countryName: "Tajikistan", cityName: "Dushanbe", timeZone: "Asia/Dushanbe",
  zones: [
    { id: "rudaki-arrival", label: "Rudaki Avenue", weather: "clear", palette: ["#75b9d0", "#e7c895", "#47656c"] },
    { id: "shaded-neighborhood", label: "Shaded neighborhood", weather: "breeze", palette: ["#8cc4cb", "#e5c98f", "#456e59"] },
    { id: "mehrgon-market", label: "Mehrgon market", weather: "haze", palette: ["#76afbd", "#ddb06b", "#315a64"] },
    { id: "chaikhana", label: "Courtyard chaikhana", weather: "golden", palette: ["#9fbeb5", "#e8ad66", "#85553d"] },
    { id: "somoni-evening", label: "Somoni at evening", weather: "evening", palette: ["#526c92", "#c98368", "#2a3d5e"] },
  ],
  encounter: { npcId: "dushanbe-host", locationLabel: "Rudaki Avenue", phrase: { original: "Хуш омадед", transliteration: "Khush omaded", gloss: "Welcome", pronunciation: "khoosh oh-mah-DED" }, exchange: ["Khush omaded — welcome.", "Thank you. The avenue feels wonderfully calm.", "Walk under the plane trees and the mountains will find you.", "Then that is where I’m headed."] },
  postcardTitle: "Dushanbe beneath the mountains", postcardCopy: "We kept the traveler moving from Rudaki Avenue to Somoni Square.",
  sourceNotes: ["Route references Dushanbe civic avenues, Mehrgon market and chaikhana courtyards.", "Cyrillic Tajik phrase and pronunciation require native-speaker review."],
});
