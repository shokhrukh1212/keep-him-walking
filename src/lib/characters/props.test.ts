import { describe, expect, it } from "vitest";
import { sampleProp } from "./props";

describe("character prop contacts",()=>{
  it("has explicit retrieve, contact, release, and stow phases",()=>{
    expect(sampleProp("drink",0).visible).toBe(false);
    expect(sampleProp("drink",.5)).toMatchObject({kind:"water",visible:true,contact:false});
    expect(sampleProp("drink",2)).toMatchObject({visible:true,contact:true});
    expect(sampleProp("drink",4.4)).toMatchObject({visible:true,contact:false});
    expect(sampleProp("drink",5.5).visible).toBe(false);
  });
  it("does not leak a stale prop after action changes or reverse seeking",()=>{
    expect(sampleProp("photo",2).visible).toBe(true);
    expect(sampleProp("idle",2).visible).toBe(false);
    expect(sampleProp("phone",0).visible).toBe(false);
  });
});
