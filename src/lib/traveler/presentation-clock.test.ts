import { describe, expect, it } from "vitest";
import { PresentationClock } from "./presentation-clock";

const runtime = (seconds = 10, distance = 25, stamp = 0, walking = true, paceRate = 2) => ({
  globalActiveSeconds: seconds,
  globalDistanceMetres: distance,
  paceRate,
  authoritativeAt: new Date(stamp).toISOString(),
  walking,
});

describe("two-track presentation clock",()=>{
  it("does not restart the gait when fresh confirmations arrive",()=>{
    const c=new PresentationClock();c.accept(runtime(),50_000,0);
    for(let t=0;t<=10_000;t+=20)c.sample(t);
    const before=c.sample(10_000);
    c.accept(runtime(20,50,10_000),50_000,10_000);
    const after=c.sample(10_020);
    expect(after.rawSeconds).toBeCloseTo(before.rawSeconds+0.02,2);
    expect(after.distanceMetres).toBeCloseTo(before.distanceMetres+0.05,2);
    c.accept(runtime(1,1,-1000),50_000,10_020);
    expect(c.sample(10_040).rawSeconds).toBeGreaterThan(before.rawSeconds);
  });
  it("never advances beyond a confirmed lease and can renew after reconnect",()=>{
    const c=new PresentationClock();c.accept(runtime(),50_000,0);
    expect(c.sample(51_000)).toEqual({rawSeconds:60,distanceMetres:150,traveling:false});
    expect(c.sample(90_000)).toEqual({rawSeconds:60,distanceMetres:150,traveling:false});
    c.accept(runtime(65,162.5,90_000),50_000,90_000);
    expect(c.sample(90_010).traveling).toBe(true);
    c.accept(runtime(65,162.5,91_000,false),50_000,91_000);
    expect(c.sample(92_000)).toEqual({rawSeconds:65,distanceMetres:162.5,traveling:false});
  });
  it("caps both tracks at sixty seconds even when the lease is longer",()=>{
    const c=new PresentationClock();c.accept(runtime(0,0,0,true,4),90_000,0);
    expect(c.sample(70_000)).toEqual({rawSeconds:60,distanceMetres:300,traveling:false});
  });
  // P18 lets the server hand out a longer lease when the crowd is large. A
  // longer lease must buy a longer *presence*, never a longer guess: the sixty
  // second presentation cap is a separate constant and stays where it is.
  it.each([70_000, 90_000])("keeps the sixty-second guess independent of a %ims lease",(ttl)=>{
    // The clock only moves forward, so each reading gets its own clock.
    const at=(ms:number)=>{const c=new PresentationClock();c.accept(runtime(0,0,0,true,4),ttl,0);return c.sample(ms);};
    expect(at(59_000).rawSeconds).toBeCloseTo(59,6);
    expect(at(60_000).rawSeconds).toBe(60);
    // Past the cap the guess stops, however much lease is left.
    expect(at(ttl)).toEqual({rawSeconds:60,distanceMetres:300,traveling:false});
  });
  it("renews an unchanged authoritative sample without rewinding its anchors",()=>{
    const c=new PresentationClock();c.accept(runtime(10,25,0,true,2),5_000,0);
    expect(c.sample(4_000)).toMatchObject({rawSeconds:14,distanceMetres:35,traveling:true});
    c.accept(runtime(10,25,0,true,2),5_000,4_000);
    const renewed=c.sample(7_000);
    expect(renewed.traveling).toBe(true);
    expect(renewed.rawSeconds).toBeGreaterThan(14);
    expect(renewed.distanceMetres).toBeGreaterThan(35);
  });
});
