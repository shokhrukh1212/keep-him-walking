import * as THREE from "three";

/** Where a prop sits in the world: its origin, and how it is turned. */
export type PropPose = { position: THREE.Vector3; quaternion: THREE.Quaternion };

/**
 * A bottle brought to the lips, rather than one carried past them.
 *
 * `carried` is how the bottle rides the fist — a rigid grip, so it rises and turns with
 * the hand. A rigid grip alone never reaches the mouth, because the takes are mimed: the
 * hand holds nothing, and it passes wherever the recorded hand passed. `reach` eases in
 * the drinking placement, which is what a hand really does with a bottle: the neck points
 * from the palm at the mouth, the tip lands on the lips, and the bottle rolls up through
 * the fingers as the arm lifts.
 *
 * `maxSlip` is the safety bound — how far the bottle's middle may sit from the palm. Half
 * the bottle's body keeps the fist on the bottle, so a take that never brings a hand near
 * the face leaves the bottle held rather than floating at the mouth.
 */
export function bottleAtLips(
  carried: PropPose,
  palm: THREE.Vector3,
  mouth: THREE.Vector3,
  neck: number,
  reach: number,
  maxSlip: number,
): PropPose {
  const position = carried.position.clone();
  const quaternion = carried.quaternion.clone();
  const blend = THREE.MathUtils.clamp(reach, 0, 1);
  const axis = mouth.clone().sub(palm);
  if (blend <= 0 || axis.lengthSq() < 1e-12) return { position, quaternion };
  axis.normalize();
  const origin = mouth.clone().addScaledVector(axis, -neck);
  const slip = origin.clone().sub(palm);
  if (slip.length() > maxSlip) origin.copy(palm).addScaledVector(slip.normalize(), maxSlip);
  // The shortest turn from where the fist holds the bottle onto the line to the mouth, so
  // a sponsor's label keeps facing the way the hand turned it.
  const held = new THREE.Vector3(0, 1, 0).applyQuaternion(carried.quaternion);
  const turned = new THREE.Quaternion().setFromUnitVectors(held, axis).multiply(carried.quaternion);
  return { position: position.lerp(origin, blend), quaternion: quaternion.slerp(turned, blend) };
}
