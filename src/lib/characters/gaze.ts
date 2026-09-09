import * as THREE from "three";

export const MAX_GAZE_RADIANS = 35 * Math.PI / 180;

/** Returns a world-space rotation from current forward toward target, with a hard clamp. */
export function clampedLookDelta(currentForward: THREE.Vector3, targetDirection: THREE.Vector3, maximum = MAX_GAZE_RADIANS): THREE.Quaternion {
  const from = currentForward.clone().normalize();
  const to = targetDirection.clone().normalize();
  if (from.lengthSq() === 0 || to.lengthSq() === 0) return new THREE.Quaternion();
  const angle = Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1));
  if (angle < 1e-6) return new THREE.Quaternion();
  const full = new THREE.Quaternion().setFromUnitVectors(from, to);
  return new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), full, Math.min(1, maximum / angle));
}
