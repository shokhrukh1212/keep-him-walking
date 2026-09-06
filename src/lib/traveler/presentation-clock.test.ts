import {describe,it,expect} from "vitest";
import {PresentationClock} from "./presentation-clock";
const runtime=(seconds=10,stamp=0,walking=true)=>({globalActiveSeconds:seconds,authoritativeAt:new Date(stamp).toISOString(),walking});
describe("monotonic shared presentation clock",()=>{
  it("does not restart the gait when fresh confirmations arrive",()=>{
    const c=new PresentationClock();c.accept(runtime(),50_000,0);
    for(let t=0;t<=10_000;t+=20)c.sample(t);
    const before=c.sample(10_000).rawSeconds;
    c.accept(runtime(20,10_000),50_000,10_000);
    expect(c.sample(10_020).rawSeconds).toBeCloseTo(before+0.02,2);
    c.accept(runtime(1,-1000),50_000,10_020);
    expect(c.sample(10_040).rawSeconds).toBeGreaterThan(before);
  });
  it("never advances beyond a confirmed lease and can renew after reconnect",()=>{
    const c=new PresentationClock();c.accept(runtime(),50_000,0);
    expect(c.sample(51_000)).toEqual({rawSeconds:60,traveling:false});
    expect(c.sample(90_000)).toEqual({rawSeconds:60,traveling:false});
    c.accept(runtime(65,90_000),50_000,90_000);
    expect(c.sample(90_010).traveling).toBe(true);
    c.accept(runtime(65,91_000,false),50_000,91_000);
    expect(c.sample(92_000)).toEqual({rawSeconds:65,traveling:false});
  });
});
