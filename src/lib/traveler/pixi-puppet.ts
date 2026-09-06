import { Assets, Container, Graphics, MeshSimple, Sprite, Texture } from "pixi.js";
import walkAsset from "../../../art/phase2/traveler/production-v2/walk-sheet.png";
import actionAsset from "../../../art/phase2/traveler/production-v2/action-sheet.png";
import transitionAsset from "../../../art/phase2/traveler/production-v2/transition-sheet.png";
import { puppetPose, type Point } from "./puppet";

type Bone = { sprite: Sprite; length: number };

async function imageAt(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** Runtime masks reuse original pixels; they do not export or generate artwork. */
function cut(image: HTMLImageElement, polygon: number[], cell = 0, keyed = false) {
  const xs = polygon.filter((_, i) => i % 2 === 0), ys = polygon.filter((_, i) => i % 2 === 1);
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  const w = Math.ceil(Math.max(...xs)) - x, h = Math.ceil(Math.max(...ys)) - y;
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.beginPath();
  for (let i = 0; i < polygon.length; i += 2) {
    if (i === 0) ctx.moveTo(polygon[i]! - x, polygon[i + 1]! - y);
    else ctx.lineTo(polygon[i]! - x, polygon[i + 1]! - y);
  }
  ctx.closePath(); ctx.clip();
  ctx.drawImage(image, (cell % 4) * 384 + x, Math.floor(cell / 4) * 512 + y, w, h, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const d = pixels.data;
    if (keyed) {
      const spill = Math.min(d[i]! - d[i + 1]!, d[i + 2]! - d[i + 1]!);
      if (spill > 8 && d[i]! > 58 && d[i + 2]! > 48) {
        const key = Math.min(1, (spill - 8) / 32);
        d[i + 3] = Math.round(d[i + 3]! * (1 - key));
        d[i] = Math.max(d[i + 1]!, d[i]! - spill * key);
        d[i + 2] = Math.max(d[i + 1]!, d[i + 2]! - spill * key);
      }
    } else {
      // The walk source has a broad, faint generated shadow around its silhouette.
      // Preserve antialiasing at the edge and remove that low-alpha halo.
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (d[i + 3]! - 28) / 210)) * 255);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  let bottom=h-1;
  scan: for(let row=h-1;row>=0;row--) for(let col=0;col<w;col++) {
    if(pixels.data[(row*w+col)*4+3]!>128) {bottom=row;break scan;}
  }
  const texture = Texture.from(canvas);
  return { texture, x, y, bottom };
}

export async function createTravelerPuppet() {
  const [walk, actions, transitions] = await Promise.all([
    imageAt(walkAsset.src), imageAt(actionAsset.src), imageAt(transitionAsset.src),
  ]);
  const owned: Texture[] = [];
  const root = new Container();
  const body = new Container();
  const shadow = new Graphics().ellipse(0, 0, 64, 9).fill({ color: 0x17251d, alpha: 0.23 });
  root.addChild(shadow, body);
  const make = (polygon: number[], pivot: Point, cell = 0, sheet = walk) => {
    const part = cut(sheet, polygon, cell, sheet !== walk); owned.push(part.texture);
    const sprite = new Sprite(part.texture);
    sprite.label=String(part.bottom);
    sprite.pivot.set(pivot.x - part.x, pivot.y - part.y);
    body.addChild(sprite); return sprite;
  };
  const bone = (polygon: number[], from: Point, to: Point): Bone => {
    const sprite = make(polygon, from);
    // Store the drawn bone axis; no pose-specific character scaling.
    sprite.label = String(Math.atan2(to.y - from.y, to.x - from.x));
    return { sprite, length: Math.hypot(to.x - from.x, to.y - from.y) };
  };
  const placeBone = (bone: Bone, from: Point, to: Point) => {
    bone.sprite.position.set(from.x, from.y);
    bone.sprite.rotation = Math.atan2(to.y - from.y, to.x - from.x) - Number(bone.sprite.label);
    bone.sprite.scale.set(Math.hypot(to.x - from.x, to.y - from.y) / bone.length);
  };

  // Draw order: far limbs, pack, torso, near limbs, head, hands/props.
  const farUpperArm = bone([207,122,231,131,239,163,259,188,245,210,222,192,203,162], {x:218,y:139}, {x:244,y:194});
  const farForearm = bone([241,184,264,193,297,204,307,220,294,238,275,231,243,211], {x:246,y:196}, {x:290,y:219});
  const farThigh = bone([159,243,191,252,161,320,139,374,104,366,120,312], {x:174,y:255}, {x:123,y:357});
  const farShin = bone([105,343,139,358,105,417,89,458,62,465,53,449,75,395], {x:123,y:355}, {x:76,y:453});
  const farShoe = make([54,434,80,441,93,451,118,464,126,480,105,495,74,488,45,475,46,451], {x:76,y:453});
  farShoe.pivot.y=Number(farShoe.label);
  const packImage = make([81,120,110,102,162,91,188,107,180,161,168,213,135,231,98,212,83,177], {x:161,y:118});
  const pack = new Container();body.addChildAt(pack,body.children.indexOf(packImage));pack.addChild(packImage);
  const patch = new Container(); pack.addChild(patch);
  // The source's visible panel; a true broad rear panel needs a rear drawing.
  patch.position.set(112 - 161, 177 - 118);
  const patchMask = new Graphics().poly([-10,-7,10,-10,11,8,-10,10]).fill(0xffffff);
  const patchArt = new MeshSimple({texture:Texture.WHITE,vertices:new Float32Array([-10,-7,10,-10,11,8,-10,10]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])});
  patch.addChild(patchArt, patchMask); patchArt.mask = patchMask; patch.visible = false;
  let currentPatch = "";
  let patchGeneration = 0;
  let destroyed = false;
  const torso = make([164,92,207,92,230,116,231,161,221,201,240,250,194,266,155,246,132,235,146,199,153,146], {x:192,y:259});
  const nearThigh = bone([171,240,202,241,222,280,246,334,239,367,208,374,187,325,165,278], {x:184,y:254}, {x:225,y:352});
  const nearShin = bone([212,335,244,342,261,389,290,439,304,453,276,470,261,447,233,401,213,373], {x:227,y:351}, {x:287,y:454});
  const nearShoe = make([275,438,298,444,309,456,343,454,351,469,334,482,291,496,265,483,263,468], {x:287,y:454});
  nearShoe.pivot.y=Number(nearShoe.label);
  const nearUpperArm = bone([150,111,171,119,179,151,160,190,148,210,126,200,136,164,139,130], {x:159,y:137}, {x:138,y:199});
  const nearForearm = bone([126,185,151,198,134,239,122,260,111,278,94,279,88,264,103,236], {x:138,y:198}, {x:111,y:260});
  const head = make([168,54,175,24,198,10,230,11,251,30,257,51,250,65,249,77,229,79,218,108,195,103,190,86,177,79], {x:212,y:87});
  const propDefinitions = {
    camera: { sprite: make([236,43,272,45,290,54,292,82,272,92,240,79], {x:251,y:73}, 7, actions), origin: {x:251,y:73} },
    bottle: { sprite: make([99,30,122,27,177,51,183,69,171,78,140,62,110,55], {x:116,y:47}, 3, transitions), origin: {x:116,y:47} },
    phone: { sprite: make([238,117,263,117,269,126,247,177,226,168], {x:244,y:155}, 6, actions), origin: {x:244,y:155} },
  };

  return {
    root,
    get textureBytes() {return owned.reduce((bytes,texture)=>bytes+texture.width*texture.height*4,0);},
    get sponsorAttached() {return patch.visible;},
    update(seconds: number, moving: boolean, life: number, action?: {kind:string;progress:number}, reduced = false, gaitWeight=1) {
      const pose = puppetPose(reduced ? 0 : seconds, moving && !reduced, reduced ? 0 : life,
        reduced && action ? {...action,progress:0.5} : action,gaitWeight);
      placeBone(farThigh, pose.hip, pose.rightKnee); placeBone(farShin, pose.rightKnee, pose.rightAnkle);
      placeBone(nearThigh, pose.hip, pose.leftKnee); placeBone(nearShin, pose.leftKnee, pose.leftAnkle);
      farShoe.position.set(pose.rightFoot.x,pose.rightFoot.y); farShoe.rotation = pose.rightFoot.roll;
      nearShoe.position.set(pose.leftFoot.x,pose.leftFoot.y); nearShoe.rotation = pose.leftFoot.roll;
      torso.position.set(pose.hip.x,pose.hip.y);
      pack.position.set(161,104+pose.bob); pack.rotation = reduced ? 0 : pose.packRotation;
      head.position.set(pose.head.x,pose.head.y); head.rotation = reduced ? 0 : pose.headRotation;
      placeBone(farUpperArm,pose.farShoulder,pose.farElbow); placeBone(farForearm,pose.farElbow,pose.farHand);
      placeBone(nearUpperArm,pose.shoulder,pose.elbow); placeBone(nearForearm,pose.elbow,pose.hand);
      for (const [kind, item] of Object.entries(propDefinitions)) {
        item.sprite.visible = pose.prop === kind;
        item.sprite.position.set(pose.hand.x,pose.hand.y);
        item.sprite.rotation = kind === "bottle" ? (1-pose.lift)*1.25 : kind === "camera" ? (1-pose.lift)*0.2 : -0.1;
      }
      shadow.position.set(192,490); shadow.scale.x = moving ? 1 + Math.cos(seconds / 1.2 * Math.PI * 4)*0.06 : 1;
      return pose;
    },
    setSponsor(url?: string) {
      if ((url ?? "") === currentPatch) return;
      currentPatch = url ?? ""; const generation = ++patchGeneration; patch.visible = false;
      if (url) void Assets.load<Texture>(url).then(texture => {
        if (destroyed || generation !== patchGeneration) return;
        patchArt.texture = texture;patch.visible=true;
      }).catch(() => undefined);
    },
    destroy() { destroyed=true;root.destroy({children:true});owned.forEach(texture=>texture.destroy(true)); },
  };
}
