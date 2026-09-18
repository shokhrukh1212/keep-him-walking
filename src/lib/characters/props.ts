import { CLIP_DURATIONS, type CharacterClip } from "./manifest";

export type PropState = {
  kind?: "water" | "device";
  visible: boolean;
  contact: boolean;
  /** 0 while the prop is only carried, 1 while it is held to the face, eased between. */
  reach: number;
  progress: number;
};

export type PropWindow = { kind: "water" | "device"; retrieve: number; contact: number; release: number; stow: number };

const WINDOWS: Partial<Record<CharacterClip,PropWindow>> = {
  // Seconds into the installed V3 takes: Drinking raises the bottle 2.1-5.6 s (lips 2.7-4.8 s);
  // Texting While Standing raises the phone 1.2-21.3 s (both hands up 1.8-20.6 s).
  drink:{kind:"water",retrieve:2.13,contact:2.67,release:4.8,stow:5.6},
  phone:{kind:"device",retrieve:1.2,contact:1.8,release:20.63,stow:21.3},
  photo:{kind:"device",retrieve:.32,contact:1.00,release:3.05,stow:3.72},
  photo_pose:{kind:"device",retrieve:.32,contact:1.00,release:3.05,stow:3.72},
};

/** The take's own prop timing, for placement that has to line up with it. */
export function propWindow(clip:CharacterClip):PropWindow|undefined{return WINDOWS[clip];}

const ease=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

/** Deterministic contact state: safe under seek, cancellation, and replay. */
export function sampleProp(clip:CharacterClip,seconds:number):PropState {
  const window=WINDOWS[clip];
  if(!window)return {visible:false,contact:false,reach:0,progress:0};
  const t=Math.max(0,Math.min(CLIP_DURATIONS[clip],Number.isFinite(seconds)?seconds:0));
  const visible=t>=window.retrieve&&t<=window.stow;
  const contact=t>=window.contact&&t<=window.release;
  const progress=visible?Math.max(0,Math.min(1,(t-window.retrieve)/(window.stow-window.retrieve))):0;
  // Reaching starts as the hand leaves the side and ends as it comes back down, so a prop
  // placed against the face arrives and leaves with the arm instead of snapping onto it.
  const reach=!visible?0
    :t<window.contact?ease((t-window.retrieve)/(window.contact-window.retrieve))
    :t<=window.release?1
    :ease((window.stow-t)/(window.stow-window.release));
  return {kind:window.kind,visible,contact,reach,progress};
}
