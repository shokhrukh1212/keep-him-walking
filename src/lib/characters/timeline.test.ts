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
    expect(sampleScene("encounter",1.8).traveler.clip).toBe("notice");
    expect(sampleScene("encounter",2.8).traveler.clip).toBe("stop");
    expect(sampleScene("encounter",4).traveler.clip).toBe("turn");
    expect(sampleScene("encounter",5.2).traveler.clip).toBe("greet");
    expect(sampleScene("encounter",10).traveler.clip).toBe("listen");
  });
  it("approaches monotonically, focuses after noticing, and restores on departure",()=>{
    const positions=[0,.8,1.8,2.8,3.9].map(t=>sampleScene("encounter",t).travelerX);
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    expect(sampleScene("encounter",2.7).cameraZoom).toBe(1);
    expect(sampleScene("encounter",3).cameraZoom).toBeGreaterThan(1);
    expect(sampleScene("encounter",ENCOUNTER_DURATION-.1).cameraZoom).toBe(1);
  });
  it("lets a resident be reviewed in each of the takes a resident carries",()=>{
    for(const clip of ["idle","walk","greet","react","goodbye"] as const)expect(sampleScene(clip,1).resident.clip).toBe(clip);
    expect(sampleScene("talk",1).resident.clip).toBe("listen");
    expect(sampleScene("listen",1).resident.clip).toBe("talk");
    expect(sampleScene("drink",1).resident.clip).toBe("idle");
    for(const {value} of REVIEW_ACTIONS)if(value!=="encounter")for(const seconds of [0,3.9,reviewDuration(value)]) {
      const cue=sampleScene(value,seconds).resident;
      expect(cue.seconds).toBeLessThan(CLIP_DURATIONS[cue.clip]);
    }
  });
  it("clamps invalid and final-frame seeks without uncovered intervals",()=>{
    for(const {value} of REVIEW_ACTIONS)for(const seconds of [-1,NaN,Infinity,reviewDuration(value),999]) {
      const cue=sampleScene(value,seconds);
      expect(Number.isFinite(cue.traveler.seconds)).toBe(true);
      expect(cue.traveler.seconds).toBeLessThan(CLIP_DURATIONS[cue.traveler.clip]);
    }
  });
});
