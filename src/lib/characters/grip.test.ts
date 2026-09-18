import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bottleAtLips, type PropPose } from "./grip";

const NECK = .14, SLIP = .1;
const held = (x: number, y: number, z: number, quaternion = new THREE.Quaternion()): PropPose =>
  ({ position: new THREE.Vector3(x, y, z), quaternion });
/** Where the tip of the neck ends up, which is the point that has to meet the lips. */
const tip = (pose: PropPose) => pose.position.clone().add(new THREE.Vector3(0, NECK, 0).applyQuaternion(pose.quaternion));

describe("bottle in a drinking hand", () => {
  const palm = new THREE.Vector3(.08, 1.55, .12);
  const mouth = new THREE.Vector3(0, 1.62, .2);

  it("leaves a carried bottle exactly where the fist holds it", () => {
    const carried = held(.08, 1.2, .1);
    const pose = bottleAtLips(carried, palm, mouth, NECK, 0, SLIP);
    expect(pose.position.distanceTo(carried.position)).toBe(0);
    expect(pose.quaternion.angleTo(carried.quaternion)).toBe(0);
    // Copies, never the caller's vectors: the actor reuses its carried pose every frame.
    pose.position.set(9, 9, 9);
    expect(carried.position.x).toBeCloseTo(.08, 12);
  });

  it("puts the tip of the neck on the lips while he drinks", () => {
    const pose = bottleAtLips(held(.08, 1.5, .1), palm, mouth, NECK, 1, SLIP);
    expect(tip(pose).distanceTo(mouth)).toBeLessThan(1e-6);
    // And it points from the hand at the mouth, so it reads as held rather than balanced.
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    expect(axis.angleTo(mouth.clone().sub(palm))).toBeLessThan(1e-6);
  });

  it("keeps the bottle in the hand when the take never brings it near the face", () => {
    const far = new THREE.Vector3(0, 2.4, 1.4);
    const pose = bottleAtLips(held(.08, 1.2, .1), palm, far, NECK, 1, SLIP);
    expect(pose.position.distanceTo(palm)).toBeCloseTo(SLIP, 6);
    expect(tip(pose).distanceTo(far)).toBeGreaterThan(.1);
  });

  it("eases between carried and drinking rather than snapping", () => {
    const carried = held(.08, 1.4, .1);
    const drinking = bottleAtLips(carried, palm, mouth, NECK, 1, SLIP);
    const halfway = bottleAtLips(carried, palm, mouth, NECK, .5, SLIP);
    expect(halfway.position.distanceTo(carried.position)).toBeGreaterThan(0);
    expect(halfway.position.distanceTo(carried.position)).toBeLessThan(drinking.position.distanceTo(carried.position));
    expect(tip(halfway).distanceTo(mouth)).toBeLessThan(tip(carried).distanceTo(mouth));
    expect(tip(halfway).distanceTo(mouth)).toBeGreaterThan(tip(drinking).distanceTo(mouth));
  });

  it("turns the bottle by the shortest arc, so a label keeps facing the way the hand turned it", () => {
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
    const carried = held(.08, 1.5, .1, roll);
    const pose = bottleAtLips(carried, palm, mouth, NECK, 1, SLIP);
    const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(roll);
    expect(pose.quaternion.angleTo(roll)).toBeCloseTo(upright.angleTo(mouth.clone().sub(palm)), 6);
  });

  it("holds the carried pose when the mouth and the palm are the same point", () => {
    const carried = held(.08, 1.5, .1);
    const pose = bottleAtLips(carried, palm, palm.clone(), NECK, 1, SLIP);
    expect(pose.position.distanceTo(carried.position)).toBe(0);
    expect(pose.quaternion.angleTo(carried.quaternion)).toBe(0);
  });
});
