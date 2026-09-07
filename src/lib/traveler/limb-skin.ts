import { mix, smooth, type Point } from "./puppet";

export type Chain = readonly [Point,Point,Point];
function onBone(p:Point,a:Point,b:Point,c:Point,d:Point) {
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  const along=((p.x-a.x)*ux+(p.y-a.y)*uy)/length;
  const across=-(p.x-a.x)*uy+(p.y-a.y)*ux;
  const targetLength=Math.hypot(d.x-c.x,d.y-c.y);
  return {x:c.x+(d.x-c.x)*along-(d.y-c.y)/targetLength*across,
    y:c.y+(d.y-c.y)*along+(d.x-c.x)/targetLength*across};
}

/** Continuous shared vertices around the joint, preserving transverse limb width. */
export function skinPoint(p:Point,source:Chain,target:Chain):Point {
  const [a,b,c]=source;
  const axis={x:c.x-a.x,y:c.y-a.y};
  const length=Math.hypot(axis.x,axis.y);
  const projected=((p.x-b.x)*axis.x+(p.y-b.y)*axis.y)/length;
  const weight=smooth((projected+14)/28);
  const upper=onBone(p,a,b,target[0],target[1]);
  const lower=onBone(p,b,c,target[1],target[2]);
  return {x:mix(upper.x,lower.x,weight),y:mix(upper.y,lower.y,weight)};
}
