import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAX_GAZE_RADIANS, clampedLookDelta } from "./gaze";

describe("head gaze", () => {
  it("clamps a large turn to thirty-five degrees", () => {
    const delta = clampedLookDelta(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    expect(delta.angleTo(new THREE.Quaternion())).toBeCloseTo(MAX_GAZE_RADIANS, 6);
  });

  it("uses the complete turn when it is inside the clamp", () => {
    const target = new THREE.Vector3(Math.sin(.2), 0, Math.cos(.2));
    expect(clampedLookDelta(new THREE.Vector3(0, 0, 1), target).angleTo(new THREE.Quaternion())).toBeCloseTo(.2, 6);
  });
});
