import { GAIT_CYCLE_SECONDS, METRES_PER_SECOND } from "./motion-clock";

export type Point = { x: number; y: number };
export const BODY_HEIGHT = 470;
export const GROUND_Y = 490;
export const BODY_METRES = 1.78;
export const PIXELS_PER_METRE = BODY_HEIGHT / BODY_METRES;
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

export function puppetPose(seconds: number, moving: boolean, life: number, action?: { kind: string; progress: number }, gaitWeight = 1) {
  const phase = seconds / GAIT_CYCLE_SECONDS * TAU;
  const lift = action ? actionLift(action.progress) : 0;
  const weight = moving ? Math.max(0,Math.min(1,gaitWeight)) : 0;
  const bob = -3 * Math.cos(phase * 2)*weight + Math.sin(life * 1.8)*0.6*(1-weight);
  const hip = { x: 192, y: 245 + bob };
  const leftFoot = moving ? footAt(seconds) : { x: seconds>0 ? footAt(seconds).x : 164, y: GROUND_Y, planted: true, roll: 0 };
  const rightFoot = moving ? footAt(seconds, true) : { x: seconds>0 ? footAt(seconds,true).x : 215, y: GROUND_Y, planted: true, roll: 0 };
  const leftAnkle={x:leftFoot.x,y:leftFoot.y-28}, rightAnkle={x:rightFoot.x,y:rightFoot.y-28};
  const shoulder = { x: 176, y: 123 + bob };
  const farShoulder = { x: 213, y: 126 + bob };
  let hand = { x: 175 - Math.cos(phase)*41*weight, y: 265 + bob - Math.abs(Math.cos(phase))*12*weight };
  let farHand = { x: 214 + Math.cos(phase)*41*weight, y: 263 + bob };
  const head = { x: 212, y: 73 + bob };
  let prop: "camera" | "bottle" | "phone" | null = null;
  if (action) {
    const target = action.kind === "photo" ? { x: 250, y: 77 + bob }
      : action.kind === "drink" ? { x: 185, y: 35 + bob }
      : action.kind === "phone" ? { x: 264, y: 174 + bob }
      : action.kind === "wave" ? { x: 275, y: 58 + Math.sin(life * 7) * 6 + bob }
      : { x: 265, y: 203 + Math.sin(life * 3) * 7 + bob };
    hand = { x: mix(hand.x, target.x, lift), y: mix(hand.y, target.y, lift) };
    if (action.kind === "photo") farHand = { x: mix(farHand.x, 273, lift), y: mix(farHand.y, 87 + bob, lift) };
    prop = action.kind === "photo" ? "camera" : action.kind === "drink" ? "bottle" : action.kind === "phone" ? "phone" : null;
  }
  // Shoulders/hips are shared joints, never separate full-body pose anchors.
  return { hip, shoulder, farShoulder, hand, farHand, head, bob, leftFoot, rightFoot,leftAnkle,rightAnkle,
    leftKnee: jointBetween(hip, leftAnkle, 126, 128), rightKnee: jointBetween(hip, rightAnkle, 126, 128),
    elbow: jointBetween(shoulder, hand, 77, 79, -1), farElbow: jointBetween(farShoulder, farHand, 77, 79, -1),
    packRotation: Math.sin(phase - 0.45)*0.023*weight + Math.sin(life*1.8-0.3)*0.004*(1-weight),
    headRotation: action ? Math.sin(life * 2) * 0.012 * lift : 0.008 * Math.sin(life * 0.7),
    lift, prop };
}
