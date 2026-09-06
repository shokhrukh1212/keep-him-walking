import type { TravelerState } from "@/lib/content/schema";

export const REVIEW_ACTIONS = [
  ["auto", "Automatic journey"], ["walk", "Walking"], ["idle", "Standing / idle"],
  ["start_walk", "Starting to walk"], ["slow_walk", "Slowing down"], ["stop", "Stopping"],
  ["notice", "Noticing someone"], ["approach", "Approaching"], ["greet", "Greeting"], ["wave", "Waving"],
  ["talk", "Talking"], ["listen", "Listening"], ["react", "Reacting / laughing"],
  ["photo", "Taking a photograph"], ["drink", "Drinking water"], ["phone", "Checking phone"],
  ["rest", "Resting"], ["sit", "Crouching / resting (no seat artwork)"],
  ["goodbye", "Saying goodbye"], ["resume_walk", "Resuming walking"],
] as const;
export type ReviewAction = typeof REVIEW_ACTIONS[number][0];
export type ActionReview = { action: ReviewAction; startedAt: number };
export type PuppetAction = { kind: string; progress: number; state?: TravelerState };
const durations: Partial<Record<ReviewAction, number>> = {photo:4,drink:5.5,phone:4.5,wave:2.5,react:2.5,greet:2.5,goodbye:2.5,talk:6,listen:6,notice:2.5,rest:6,sit:6};

/** Local visual rehearsal only. Never feeds presence, route authority or accounting. */
export function reviewPoseAt(review: ActionReview, now: number) {
  const seconds = Math.max(0, (now-review.startedAt)/1000);
  const state = review.action;
  if(state === "auto") return null;
  const duration = durations[state];
  if(duration) {
    const local=seconds%(duration+1.2);
    if(local>=duration) return {seconds, moving:true, weight:1, action:undefined, state:"walk" as const};
    return {seconds:0, moving:false, weight:0, action:{kind:state, state, progress:local/duration},state};
  }
  const progress=Math.min(1,seconds/1.2);
  const weight=state==="idle"?0:state==="stop"||state==="slow_walk"?1-progress:state==="start_walk"||state==="resume_walk"?progress:1;
  const t=Math.min(1.2,seconds);
  const gaitSeconds=state==="stop"||state==="slow_walk"?t-t*t/2.4:
    state==="start_walk"||state==="resume_walk"?t*t/2.4+Math.max(0,seconds-1.2):seconds;
  return {seconds:gaitSeconds, moving:weight>0, weight, action:undefined, state};
}
