import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "./motion-clock";
import type { PuppetAction } from "./action-preview";

export type Point = { x: number; y: number };
export const BODY_HEIGHT = 510;
export const GROUND_Y = 490;
export const BODY_METRES = 1.78;
export const PIXELS_PER_METRE = BODY_HEIGHT / BODY_METRES;
export const THIGH_LENGTH = 119;
export const SHIN_LENGTH = 120;
const TAU = Math.PI * 2;
export const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Two fixed-length bones, with a stable anatomical bend direction. */
export function jointBetween(root: Point, end: Point, a: number, b: number, bend = 1): Point {
  const dx = end.x - root.x, dy = end.y - root.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const d = Math.min(a + b - 0.001, Math.max(Math.abs(a - b) + 0.001, distance));
  const along = (a * a - b * b + d * d) / (2 * d);
  const away = Math.sqrt(Math.max(0, a * a - along * along)) * bend;
  return { x: root.x + dx / distance * along + dy / distance * away,
    y: root.y + dy / distance * along - dx / distance * away };
}

/** Stance moves backwards at exactly the ground velocity; swing returns above it. */
export function footAt(seconds: number, opposite = false) {
  const cycle = seconds / GAIT_CYCLE_SECONDS + (opposite ? 0.5 : 0);
  const phase = ((cycle % 1) + 1) % 1;
  const stance = 0.6;
  const travel = METRES_PER_SECOND * GAIT_CYCLE_SECONDS * PIXELS_PER_METRE;
  const front = travel * stance / 2;
  if (phase < stance) return { x: 192 + front - phase * travel, y: GROUND_Y,
    planted: true, roll: 0 };
  const t = (phase - stance) / (1 - stance);
  const tangent=-travel*(1-stance);
  const x=(2*t*t*t-3*t*t+1)*-front+(t*t*t-2*t*t+t)*tangent+(-2*t*t*t+3*t*t)*front+(t*t*t-t*t)*tangent;
  return { x: 192 + x, y: GROUND_Y - Math.sin(Math.PI * t)**2 * 46,
    planted: false, roll: Math.sin(Math.PI * t) * 0.2 };
}

export function actionLift(progress: number) {
  return smooth(progress / 0.27) * (1 - smooth((progress - 0.7) / 0.3));
}

export function puppetPose(seconds: number, moving: boolean, life: number, action?: PuppetAction, gaitWeight = 1) {
  const phase = seconds / GAIT_CYCLE_SECONDS * TAU;
  const lift = action ? actionLift(action.progress) : 0;
  const weight = moving ? Math.max(0,Math.min(1,gaitWeight)) : 0;
  // A rest is an upright stance, not a frozen wide-stride walking frame.
  const resting=action?.kind==="sit";
  const leftFoot = moving ? footAt(seconds) : { x: 210, y: GROUND_Y, planted: true, roll: 0 };
  const rightFoot = moving ? footAt(seconds, true) : { x: 173, y: GROUND_Y, planted: true, roll: 0 };
  const leftAnkle={x:leftFoot.x,y:leftFoot.y-28}, rightAnkle={x:rightFoot.x,y:rightFoot.y-28};
  // Keep the support leg almost extended, lowering the pelvis only as required
  // by the stride. Never ask the IK solver to reach beyond the actual leg.
  const reach=THIGH_LENGTH+SHIN_LENGTH-2;
  const hipY=Math.max(226,...[leftAnkle,rightAnkle].map((foot,i)=>
    foot.y-Math.sqrt(Math.max(1,reach*reach-(foot.x-(i===0?198:186))**2))));
  const bob=hipY-245+Math.sin(life*1.8)*0.5+(resting?lift*25:0);
  const hip = { x: 192, y: 245 + bob };
  const leftHip={x:hip.x+6,y:hip.y},rightHip={x:hip.x-6,y:hip.y};
  const shoulder = { x: 160, y: 123 + bob };
  const farShoulder = { x: 213, y: 126 + bob };
  let hand = { x: 151 - Math.cos(phase)*36*weight, y: 248 + bob - Math.abs(Math.cos(phase))*10*weight };
  let farHand = { x: 214 + Math.cos(phase)*36*weight, y: 249 + bob };
  const head = { x: 212, y: 73 + bob };
  let prop: "camera" | "bottle" | "phone" | null = null;
  let propAngle=0;
  if (action) {
    const state=action.state??action.kind;
    const gesture=state==="listen"||state==="notice"?0.15:1;
    const target = action.kind === "photo" ? { x: 249, y: 73 + bob }
      : action.kind === "drink" ? { x: 213, y: 65 + bob }
      : action.kind === "phone" ? { x: 246, y: 169 + bob }
      : ["wave","greet","goodbye"].includes(state) ? { x: 224+Math.sin(life*7)*6, y: 83 + bob }
      : state==="rest"||state==="sit" ? {x:187,y:242+bob}
      : { x: 160+gesture*77, y: 247-gesture*48 + Math.sin(life * 3)*gesture*5 + bob };
    hand = { x: mix(hand.x, target.x, lift), y: mix(hand.y, target.y, lift) };
    if (action.kind === "photo") farHand = { x: mix(farHand.x, 279, lift), y: mix(farHand.y, 76 + bob, lift) };
    prop = action.kind === "photo" ? "camera" : action.kind === "drink" ? "bottle" : action.kind === "phone" ? "phone" : null;
    // Donor bottle grip -> cap is (61,14); rotate cap to the mouth while sipping.
    propAngle=prop==="bottle"?mix(1.1,-0.23,lift):prop==="camera"?mix(0.5,0,lift):-0.1;
  }
  // Shoulders/hips are shared joints, never separate full-body pose anchors.
  return { hip,leftHip,rightHip, shoulder, farShoulder, hand, farHand, head, bob, leftFoot, rightFoot,leftAnkle,rightAnkle,
    leftKnee: jointBetween(leftHip, leftAnkle, THIGH_LENGTH, SHIN_LENGTH), rightKnee: jointBetween(rightHip, rightAnkle, THIGH_LENGTH, SHIN_LENGTH),
    elbow: jointBetween(shoulder, hand, 66, 65, -1), farElbow: jointBetween(farShoulder, farHand, 66, 65, -1),
    packRotation: Math.sin(phase - 0.45)*0.023*weight + Math.sin(life*1.8-0.3)*0.004*(1-weight),
    headRotation: action ? Math.sin(life * 2) * 0.012 * lift : 0.008 * Math.sin(life * 0.7),
    lift, prop,propAngle };
}

export type PuppetPose=ReturnType<typeof puppetPose>;
/** Blend one connected skeleton, never cross-fade incompatible full-body pictures. */
export function settlePose(from:PuppetPose,to:PuppetPose,progress:number):PuppetPose {
  const t=smooth(progress);
  const point=(a:Point,b:Point)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
  const hip=point(from.hip,to.hip),leftHip=point(from.leftHip,to.leftHip),rightHip=point(from.rightHip,to.rightHip);
  const leftFoot={...to.leftFoot,...point(from.leftFoot,to.leftFoot),roll:mix(from.leftFoot.roll,to.leftFoot.roll,t)};
  const rightFoot={...to.rightFoot,...point(from.rightFoot,to.rightFoot),roll:mix(from.rightFoot.roll,to.rightFoot.roll,t)};
  const leftAnkle={x:leftFoot.x,y:leftFoot.y-28},rightAnkle={x:rightFoot.x,y:rightFoot.y-28};
  const shoulder=point(from.shoulder,to.shoulder),farShoulder=point(from.farShoulder,to.farShoulder);
  const hand=point(from.hand,to.hand),farHand=point(from.farHand,to.farHand);
  return {...to,hip,leftHip,rightHip,leftFoot,rightFoot,leftAnkle,rightAnkle,shoulder,farShoulder,hand,farHand,
    head:point(from.head,to.head),bob:mix(from.bob,to.bob,t),
    leftKnee:jointBetween(leftHip,leftAnkle,THIGH_LENGTH,SHIN_LENGTH),rightKnee:jointBetween(rightHip,rightAnkle,THIGH_LENGTH,SHIN_LENGTH),
    elbow:jointBetween(shoulder,hand,66,65,-1),farElbow:jointBetween(farShoulder,farHand,66,65,-1)};
}
