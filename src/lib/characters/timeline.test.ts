import { describe, expect, it } from "vitest";
import { ENCOUNTER_DURATION, reviewDuration, sampleScene } from "./timeline";
import { CLIP_DURATIONS, REVIEW_ACTIONS } from "./manifest";

describe("character scene timeline",()=>{
  it("gives the listener and speaker complementary roles through the whole encounter",()=>{
    for(let t=0;t<ENCOUNTER_DURATION;t+=.05) {
      const scene=sampleScene("encounter",t);
      expect(scene.traveler.seconds).toBeGreaterThanOrEqual(0);
      expect(scene.traveler.seconds).toBeLessThan(CLIP_DURATIONS[scene.traveler.clip]);
      expect(scene.resident.seconds).toBeLessThan(CLIP_DURATIONS[scene.resident.clip]);
      if(scene.dialogue?.speaker==="Traveler") {
        expect(scene.traveler.clip).toBe("talk");expect(scene.resident.clip).toBe("listen");
      }
      if(scene.dialogue?.speaker==="Local resident") {
        expect(scene.traveler.clip).toBe("listen");expect(scene.resident.clip).toBe("talk");
      }
    }
  });
  it("is deterministic when seeking backwards, including clip boundaries",()=>{
    const first=sampleScene("encounter",6);
    sampleScene("encounter",18);
    expect(sampleScene("encounter",6)).toEqual(first);
    expect(sampleScene("encounter",2.4).traveler.clip).toBe("greet");
    expect(sampleScene("encounter",5.4).traveler.clip).toBe("listen");
  });
  it("clamps invalid and final-frame seeks without uncovered intervals",()=>{
    for(const {value} of REVIEW_ACTIONS)for(const seconds of [-1,NaN,Infinity,reviewDuration(value),999]) {
      const cue=sampleScene(value,seconds);
      expect(Number.isFinite(cue.traveler.seconds)).toBe(true);
      expect(cue.traveler.seconds).toBeLessThan(CLIP_DURATIONS[cue.traveler.clip]);
    }
  });
});
