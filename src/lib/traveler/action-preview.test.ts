import {describe,it,expect} from "vitest";
import {REVIEW_ACTIONS,reviewPoseAt} from "./action-preview";
import {skinPoint} from "./limb-skin";
import {actorLayout} from "./actor-layout";
import { stageSchema } from "../content/schema";
import { stageLayout } from "../world/stage-layout";
describe("local action inspection",()=>{
  it("leaves the authoritative journey alone in automatic mode",()=>{
    expect(reviewPoseAt({action:"auto",startedAt:0},5000)).toBeNull();
  });
  it("covers all selectable states with finite bounded action progress",()=>{
    for(const [action] of REVIEW_ACTIONS)for(let ms=0;ms<15000;ms+=125) {
      const p=reviewPoseAt({action,startedAt:0},ms);
      if(!p)continue;
      expect(Number.isFinite(p.seconds)).toBe(true);
      if(p.action) {expect(p.action.progress).toBeGreaterThanOrEqual(0);expect(p.action.progress).toBeLessThanOrEqual(1);}
    }
  });
  it("completes every purposeful action and resumes walking before replay",()=>{
    for(const [action] of REVIEW_ACTIONS.filter(([a])=>["photo","drink","phone","talk","listen","wave","react","rest","sit","goodbye"].includes(a))) {
      let returned=false;
      for(let ms=100;ms<9000;ms+=100)if(reviewPoseAt({action,startedAt:0},ms)?.state==="walk")returned=true;
      expect(returned,action).toBe(true);
    }
  });
  it("keeps an unbent skin unchanged and the joint surface continuous when bent",()=>{
    const source=[{x:0,y:0},{x:0,y:70},{x:0,y:140}] as const;
    for(let y=0;y<=140;y++) {const p=skinPoint({x:5,y},source,source);expect(p.x).toBeCloseTo(5,8);expect(p.y).toBeCloseTo(y,8);}
    const target=[{x:0,y:0},{x:0,y:70},{x:55,y:105}] as const;
    const a=skinPoint({x:5,y:70-0.001},source,target),b=skinPoint({x:5,y:70+0.001},source,target);
    expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(0.01);
  });
  it("uses one shared physical scale for all states and both actor layouts",()=>{
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const stage = stageLayout(width, height, 1600, 900, stageSchema.parse({}));
      expect(actorLayout(height, stage)).toEqual({height: stage.personHeightPx, bottom: height - stage.groundY});
    }
  });
});
