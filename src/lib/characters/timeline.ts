import { CLIP_DURATIONS, type CharacterClip, type ReviewAction } from "./manifest";

export type CharacterCue = { clip: CharacterClip; seconds: number };
export type SceneCue = {
  traveler: CharacterCue; resident: CharacterCue; phase: string;
  travelerX: number; travelerYaw: number; residentYaw: number;
  dialogue?: { speaker: "Traveler" | "Local resident"; text: string };
};
const SEGMENTS: { duration: number; traveler: CharacterClip; resident: CharacterClip; phase: string;
  dialogue?: SceneCue["dialogue"] }[] = [
  {duration:2.4,traveler:"walk",resident:"idle",phase:"Approaching"},
  {duration:3,traveler:"greet",resident:"greet",phase:"Greeting"},
  {duration:4,traveler:"listen",resident:"talk",phase:"Listening",dialogue:{speaker:"Local resident",text:"Welcome to Almaty. Have you had a chance to see the mountains?"}},
  {duration:4,traveler:"talk",resident:"listen",phase:"Speaking",dialogue:{speaker:"Traveler",text:"They’re incredible. I’m taking the long way through the city today."}},
  {duration:3,traveler:"react",resident:"react",phase:"Reacting"},
  {duration:3,traveler:"goodbye",resident:"goodbye",phase:"Saying goodbye"},
  {duration:2.4,traveler:"walk",resident:"idle",phase:"Resuming the walk"},
];
export const ENCOUNTER_DURATION = SEGMENTS.reduce((sum,s)=>sum+s.duration,0);
export function reviewDuration(action: ReviewAction) {
  return action==="encounter" ? ENCOUNTER_DURATION : CLIP_DURATIONS[action];
}
export function sampleScene(action: ReviewAction, seconds: number): SceneCue {
  const duration=reviewDuration(action);
  const time=Math.max(0,Math.min(duration-1e-6,Number.isFinite(seconds)?seconds:0));
  if(action!=="encounter") return {
    traveler:{clip:action,seconds:time}, resident:{clip:action==="talk"?"listen":action==="listen"?"talk":"idle",seconds:time%4},
    phase:action,travelerX:-.5,travelerYaw:Math.PI/2,residentYaw:-Math.PI/2,
  };
  let start=0;
  for(const segment of SEGMENTS) {
    if(time<start+segment.duration) {
      const local=time-start;
      const arriving=start===0;
      const leaving=start+segment.duration>=duration;
      return {
        traveler:{clip:segment.traveler,seconds:local%CLIP_DURATIONS[segment.traveler]},
        resident:{clip:segment.resident,seconds:local%CLIP_DURATIONS[segment.resident]},
        phase:segment.phase,dialogue:segment.dialogue,
        travelerX:arriving?-1.3+.8*local/segment.duration:leaving?-.5+.8*local/segment.duration:-.5,
        travelerYaw:Math.PI/2,residentYaw:-Math.PI/2,
      };
    }
    start+=segment.duration;
  }
  throw new Error("Encounter timeline has an uncovered interval");
}
