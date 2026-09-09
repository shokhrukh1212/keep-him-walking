import { CLIP_DURATIONS, type CharacterClip, type ReviewAction } from "./manifest";

const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

export type CharacterCue = { clip: CharacterClip; seconds: number; timeScale?: number };
export type SceneCue = {
  traveler: CharacterCue; resident: CharacterCue; phase: string;
  travelerX: number; travelerYaw: number; residentYaw: number;
  cameraZoom: number;
  dialogue?: { speaker: "Traveler" | "Local resident"; text: string };
};
const SEGMENTS: { duration: number; traveler: CharacterClip; resident: CharacterClip; phase: string;
  dialogue?: SceneCue["dialogue"] }[] = [
  {duration:1.8,traveler:"walk",resident:"idle",phase:"Walking"},
  {duration:1,traveler:"notice",resident:"idle",phase:"Noticing"},
  {duration:1.2,traveler:"stop",resident:"idle",phase:"Slowing and stopping"},
  {duration:1.2,traveler:"turn",resident:"idle",phase:"Turning to approach"},
  {duration:4.8,traveler:"greet",resident:"greet",phase:"Greeting"},
  {duration:4,traveler:"listen",resident:"talk",phase:"Listening",dialogue:{speaker:"Local resident",text:"Welcome to Almaty. Have you had a chance to see the mountains?"}},
  {duration:4,traveler:"talk",resident:"listen",phase:"Speaking",dialogue:{speaker:"Traveler",text:"They’re incredible. I’m taking the long way through the city today."}},
  {duration:3,traveler:"react",resident:"listen",phase:"Reacting"},
  {duration:3,traveler:"goodbye",resident:"goodbye",phase:"Saying goodbye"},
  {duration:1.2,traveler:"resume",resident:"idle",phase:"Resuming the walk"},
  {duration:1.8,traveler:"walk",resident:"idle",phase:"Walking onward"},
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
    phase:action,travelerX:-.5,travelerYaw:Math.PI/2,residentYaw:-Math.PI/2,cameraZoom:1,
  };
  let start=0;
  for(const segment of SEGMENTS) {
    if(time<start+segment.duration) {
      const local=time-start;
      const sceneTime=start+local;
      const arriving=sceneTime<4;
      const leaving=sceneTime>=duration-3;
      const focusIn=smooth((sceneTime-2.8)/1.2);
      const focusOut=1-smooth((sceneTime-(duration-3))/1.2);
      const cameraZoom=1+.12*Math.min(focusIn,focusOut);
      return {
        traveler:{clip:segment.traveler,seconds:local%CLIP_DURATIONS[segment.traveler]},
        resident:{clip:segment.resident,seconds:segment.resident==="greet"?Math.max(0,local-.4):
          segment.resident==="goodbye"?Math.max(0,local-.25):local%CLIP_DURATIONS[segment.resident]},
        phase:segment.phase,dialogue:segment.dialogue,
        travelerX:arriving?-1.3+.8*Math.min(1,sceneTime/4):leaving?-.5+.8*Math.min(1,(sceneTime-(duration-3))/3):-.5,
        travelerYaw:Math.PI/2,residentYaw:-Math.PI/2,cameraZoom,
      };
    }
    start+=segment.duration;
  }
  throw new Error("Encounter timeline has an uncovered interval");
}
