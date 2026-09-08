import { CLIP_DURATIONS, type CharacterClip } from "./manifest";

export type PropState = {
  kind?: "water" | "device";
  visible: boolean;
  contact: boolean;
  progress: number;
};

const WINDOWS: Partial<Record<CharacterClip,{kind:"water"|"device";retrieve:number;contact:number;release:number;stow:number}>> = {
  drink:{kind:"water",retrieve:.28,contact:1.2,release:3.85,stow:5.18},
  phone:{kind:"device",retrieve:.30,contact:.82,release:3.65,stow:4.22},
  photo:{kind:"device",retrieve:.32,contact:1.00,release:3.05,stow:3.72},
};

/** Deterministic contact state: safe under seek, cancellation, and replay. */
export function sampleProp(clip:CharacterClip,seconds:number):PropState {
  const window=WINDOWS[clip];
  if(!window)return {visible:false,contact:false,progress:0};
  const t=Math.max(0,Math.min(CLIP_DURATIONS[clip],Number.isFinite(seconds)?seconds:0));
  const visible=t>=window.retrieve&&t<=window.stow;
  const contact=t>=window.contact&&t<=window.release;
  const progress=visible?Math.max(0,Math.min(1,(t-window.retrieve)/(window.stow-window.retrieve))):0;
  return {kind:window.kind,visible,contact,progress};
}
