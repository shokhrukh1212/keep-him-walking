import {describe,it,expect} from "vitest";
import {footAt,GROUND_Y,PIXELS_PER_METRE,puppetPose,actionLift,THIGH_LENGTH,SHIN_LENGTH,settlePose} from "./puppet";
import {METRES_PER_SECOND} from "./motion-clock";

describe("connected traveler geometry",()=>{
  it("locks each supporting foot to a world point, including at different refresh rates",()=>{
    for(const fps of [30,60,120]) for(const opposite of [false,true]) {
      const start=opposite?0.62:0.02;
      const first=footAt(start,opposite);
      const worldX=first.x+start*METRES_PER_SECOND*PIXELS_PER_METRE;
      for(let i=1;i<fps/2;i++) {
        const t=start+i/fps,foot=footAt(t,opposite);
        expect(foot.planted).toBe(true);expect(foot.y).toBe(GROUND_Y);
        expect(foot.x+t*METRES_PER_SECOND*PIXELS_PER_METRE).toBeCloseTo(worldX,7);
      }
    }
  });
  it("keeps fixed bone lengths through a full gait and action vocabulary",()=>{
    for(let i=0;i<120;i++) {
      const p=puppetPose(i/100,true,i/100);
      for(const [hip,knee,ankle] of [[p.leftHip,p.leftKnee,p.leftAnkle],[p.rightHip,p.rightKnee,p.rightAnkle]]) {
        expect(Math.hypot(knee!.x-hip!.x,knee!.y-hip!.y)).toBeCloseTo(THIGH_LENGTH,4);
        expect(Math.hypot(ankle!.x-knee!.x,ankle!.y-knee!.y)).toBeCloseTo(SHIN_LENGTH,4);
      }
    }
    for(const kind of ["photo","drink","phone","wave","encounter","notice","greet","talk","listen","react","rest","sit","goodbye"]) for(const progress of [0,0.25,0.5,0.75,1]) {
      const p=puppetPose(0,false,1,{kind,progress});
      expect(Math.hypot(p.elbow.x-p.shoulder.x,p.elbow.y-p.shoulder.y)).toBeCloseTo(66,4);
      expect(Math.hypot(p.hand.x-p.elbow.x,p.hand.y-p.elbow.y)).toBeCloseTo(65,4);
      expect(p.leftFoot.y).toBe(GROUND_Y);expect(p.rightFoot.y).toBe(GROUND_Y);
    }
  });
  it("raises and lowers action props instead of holding a whole-body still",()=>{
    expect(actionLift(0)).toBe(0);expect(actionLift(0.5)).toBe(1);expect(actionLift(1)).toBe(0);
    const low=puppetPose(0,false,0,{kind:"photo",progress:0});
    const high=puppetPose(0,false,0,{kind:"photo",progress:0.5});
    expect(high.hand.y).toBeLessThan(low.hand.y-100);
    expect(high.hip).toEqual(low.hip);expect(high.head).toEqual(low.head);
  });
  it("swings the near arm behind the forward near leg and settles with speed",()=>{
    const contact=puppetPose(0,true,0);
    expect(contact.leftFoot.x).toBeGreaterThan(contact.hip.x);
    expect(contact.hand.x).toBeLessThan(contact.shoulder.x);
    const other=puppetPose(0.6,true,0);
    expect(other.hand.x).toBeGreaterThan(other.shoulder.x);
    const settled=puppetPose(0.6,false,0,undefined,0);
    expect(settled.hand).toEqual(puppetPose(0.6,false,0).hand);
  });
  it("stands upright at any interrupted gait phase with feet below the pelvis",()=>{
    for(const seconds of [0,0.2,0.6,0.95]) {
      const p=puppetPose(seconds,false,0);
      expect(p.leftFoot.x).toBe(210);expect(p.rightFoot.x).toBe(173);
      expect(p.leftAnkle.y-p.leftHip.y).toBeGreaterThan(232);
      expect(Math.abs(p.leftKnee.x-p.leftHip.x)).toBeLessThan(35);
    }
  });
  it("blends one skeleton with connected elbows through every action entry",()=>{
    const from=puppetPose(0.2,true,0);
    for(const kind of ["photo","drink","phone","wave","talk","listen","react","rest","sit","goodbye"])
      for(let i=0;i<=10;i++) {
        const pose=settlePose(from,puppetPose(0,false,0,{kind,progress:0.5}),i/10);
        expect(Math.hypot(pose.elbow.x-pose.shoulder.x,pose.elbow.y-pose.shoulder.y)).toBeCloseTo(66,4);
        expect(pose.leftFoot.y).toBeLessThanOrEqual(GROUND_Y);
      }
  });
});
