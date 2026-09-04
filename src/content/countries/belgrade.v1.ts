import { createPhase3EditorialPack } from "./phase3-factory";
export const belgradeCountryPackV1 = createPhase3EditorialPack({
  packId: "belgrade-v1", countryCode: "RS", countryName: "Serbia", cityName: "Belgrade", timeZone: "Europe/Belgrade",
  zones: [
    { id: "republic-arrival", label: "Republic Square", weather: "clear", palette: ["#79b8d8", "#e8cf9d", "#617a82"] },
    { id: "dorcol-streets", label: "Dorćol streets", weather: "breeze", palette: ["#83b9ca", "#dfbd83", "#69705d"] },
    { id: "green-market", label: "Green market", weather: "haze", palette: ["#8ab4b8", "#d99e63", "#74554a"] },
    { id: "riverside-cafe", label: "Riverside café", weather: "golden", palette: ["#86aca9", "#db905c", "#7c5144"] },
    { id: "kalemegdan-evening", label: "Kalemegdan sunset", weather: "evening", palette: ["#526d94", "#cf806d", "#34415b"] },
  ],
  encounter: { npcId: "belgrade-host", locationLabel: "Dorćol", phrase: { original: "Добро дошли", transliteration: "Dobro došli", gloss: "Welcome", pronunciation: "DOH-broh DOH-shlee" }, exchange: ["Dobro došli — welcome to Belgrade.", "Every street seems to lean toward the rivers.", "They meet below the fortress.", "I’ll save the last steps for that view."] },
  postcardTitle: "Where two rivers meet", postcardCopy: "The shared walk crossed Belgrade to the light above the Sava and Danube.",
  sourceNotes: ["Unpublished editorial buffer route centers official Belgrade visitor landmarks.", "Serbian phrase and all cultural details require qualified local review before publication."],
}, [{ title: "Tourist Organization of Belgrade — What to See", url: "https://www.tob.rs/en/what-to-see" }]);
