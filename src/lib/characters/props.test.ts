import { describe, expect, it } from "vitest";
import { sampleProp } from "./props";

describe("character prop contacts",()=>{
  it("has explicit retrieve, contact, release, and stow phases",()=>{
    expect(sampleProp("drink",1).visible).toBe(false);
    expect(sampleProp("drink",2.4)).toMatchObject({kind:"water",visible:true,contact:false});
    expect(sampleProp("drink",3.5)).toMatchObject({visible:true,contact:true});
    expect(sampleProp("drink",5.2)).toMatchObject({visible:true,contact:false});
    expect(sampleProp("drink",6).visible).toBe(false);
    expect(sampleProp("phone",10)).toMatchObject({kind:"device",visible:true,contact:true});
    expect(sampleProp("phone",22).visible).toBe(false);
  });
  it("eases the reach so a prop arrives at the face with the arm",()=>{
    expect(sampleProp("drink",2).reach).toBe(0);
    expect(sampleProp("drink",2.13).reach).toBe(0);
    const rising=sampleProp("drink",2.4).reach;
    expect(rising).toBeGreaterThan(0);expect(rising).toBeLessThan(1);
    expect(sampleProp("drink",2.67).reach).toBe(1);
    expect(sampleProp("drink",3.5).reach).toBe(1);
    expect(sampleProp("drink",4.8).reach).toBe(1);
    const falling=sampleProp("drink",5.2).reach;
    expect(falling).toBeGreaterThan(0);expect(falling).toBeLessThan(1);
    expect(sampleProp("drink",5.6).reach).toBe(0);
    expect(sampleProp("drink",6).reach).toBe(0);
    expect(sampleProp("idle",3).reach).toBe(0);
  });
  it("does not leak a stale prop after action changes or reverse seeking",()=>{
    expect(sampleProp("photo",2).visible).toBe(true);
    expect(sampleProp("idle",2).visible).toBe(false);
    expect(sampleProp("phone",0).visible).toBe(false);
  });
});
