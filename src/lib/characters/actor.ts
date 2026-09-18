import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CLIP_DURATIONS, CLIP_SPECS, clipFallbackChain, normalizedClipName, type CharacterClip } from "./manifest";
import type { CharacterCue } from "./timeline";
import { propWindow, sampleProp } from "./props";
import { bottleAtLips, type PropPose } from "./grip";
import { CharacterAppearance } from "./appearance";
import { clampedLookDelta } from "./gaze";
import type { VisualGrade } from "../world/visual-grade";

function box(w:number,h:number,d:number,color:number,r=.65) {
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:r}));
}
function bottle() {
  const group=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.027,.105,5,16),new THREE.MeshPhysicalMaterial({color:0x68b5df,roughness:.22,transmission:.18,transparent:true,opacity:.88}));
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.014,.020,.028,16),new THREE.MeshStandardMaterial({color:0x68b5df,roughness:.28}));
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.016,16),new THREE.MeshStandardMaterial({color:0xe9e5d5,roughness:.5}));
  body.name="Bottle body";
  neck.position.y=.087;cap.position.y=.108;neck.name="Bottle neck";cap.name="Bottle cap";group.add(body,neck,cap);return group;
}
function phone() {
  const group=new THREE.Group(),frame=box(.074,.142,.013,0x20262b,.32),screen=box(.066,.121,.0015,0x86b7c6,.28);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,.0025,16),new THREE.MeshStandardMaterial({color:0x12191c,roughness:.18,metalness:.2}));
  screen.position.z=.0072;lens.position.set(.023,.049,-.0075);lens.rotation.x=Math.PI/2;
  group.add(frame,screen,lens);return group;
}
function umbrella() {
  const group = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(.48, .18, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8b34d, side: THREE.DoubleSide, roughness: .8 }),
  );
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(.008, .008, 1.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x59422f, roughness: .7 }),
  );
  canopy.position.y = 1.72;
  canopy.rotation.x = Math.PI;
  stick.position.set(.28, 1.08, 0);
  group.add(canopy, stick);
  return group;
}
const smooth=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};

/** One mesh/skeleton across every action; only skeletal clips and face weights change. */
export class CharacterActor {
  readonly root: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private actions=new Map<CharacterClip,THREE.AnimationAction>();
  private active?: CharacterClip;
  private previous?: CharacterClip;
  private blend=1;
  private faces: THREE.Mesh[]=[];
  private water=bottle();
  private device=phone();
  private umbrella=umbrella();
  private hand?:THREE.Object3D;
  private leftHand?:THREE.Object3D;
  private leftGrip?:THREE.Object3D;
  private rightGrip?:THREE.Object3D;
  private leftThumb?:THREE.Object3D;
  private rightThumb?:THREE.Object3D;
  private teeth?:THREE.SkinnedMesh;
  private head?:THREE.Object3D;
  /** The lips, in head-local metres, measured from the teeth this character actually has. */
  private lips?:THREE.Vector3;
  /** Set only when the installed drink take uses a hand the authored grips were not cut for. */
  private drinking?:{hand:THREE.Object3D;palm:THREE.Object3D;thumb:THREE.Object3D;carried:PropPose};
  /** The built bottle, in its own units: the tip of its open neck, and half its body. */
  private bottleNeck=0;
  private bottleBody=0;
  private propsEnabled:boolean;
  private socketPoint=new THREE.Vector3();
  private otherPoint=new THREE.Vector3();
  private palmPoint=new THREE.Vector3();
  private thumbPoint=new THREE.Vector3();
  private mouthPoint=new THREE.Vector3();
  private propScale=new THREE.Vector3();
  private carriedPose:PropPose={position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};
  private orientation=new THREE.Quaternion();
  private handOrientation=new THREE.Quaternion();
  private interactionUnit=1;
  private grips=new Map<string,{position:THREE.Vector3;rotation:THREE.Quaternion}>();
  readonly appearance = new CharacterAppearance();
  private sourceMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private sponsorMaterial?:THREE.MeshStandardMaterial;
  private sponsorTexture?:THREE.Texture;
  private sponsorUrl?:string;
  private sponsorRevision=0;
  private bottleTexture?:THREE.Texture;
  private bottleUrl?:string;
  private bottleRevision=0;
  constructor(gltf:GLTF,height:number,withProps:boolean) {
    this.root=gltf.scene;
    this.propsEnabled=withProps;
    // Measured from the bottle just built, before anything moves it, so placement and
    // geometry can never drift apart. The cap comes off in the hand, so the neck is the tip.
    this.bottleNeck=new THREE.Box3().setFromObject(this.water.getObjectByName("Bottle neck")!).max.y;
    this.bottleBody=new THREE.Box3().setFromObject(this.water.getObjectByName("Bottle body")!).max.y;
    this.mixer=new THREE.AnimationMixer(this.root);
    const animationByName = new Map(gltf.animations.map((clip) => [normalizedClipName(clip.name), clip]));
    for(const name of Object.keys(CLIP_SPECS) as CharacterClip[]) {
      const aliases = [name, ...CLIP_SPECS[name].aliases];
      const clip = aliases.map(normalizedClipName).map((alias) => animationByName.get(alias)).find(Boolean);
      if(!clip) continue;
      const action=this.mixer.clipAction(clip);action.play();action.enabled=false;
      this.actions.set(name,action);
    }
    if (!this.actions.has("idle") || !this.actions.has("walk")) {
      throw new Error("Character requires idle and walk animations");
    }
    // Calibrate standing height once, using the actual standing clip rather
    // than the wider bind pose. Never renormalize bounds during an action.
    this.poseIdle();
    const bounds=new THREE.Box3().setFromObject(this.root),scale=height/(bounds.max.y-bounds.min.y);
    this.root.scale.multiplyScalar(scale);
    this.root.position.y-=bounds.min.y*scale;
    this.root.position.x-=(bounds.min.x+bounds.max.x)/2*scale;
    this.root.traverse(object=>{
      if(typeof object.userData.interactionUnit==="number"){
        this.interactionUnit=object.userData.interactionUnit;
        for(const name of ["drink","phone","photo"]){
          const position=object.userData[name+"GripPosition"],rotation=object.userData[name+"GripRotation"];
          if(Array.isArray(position)&&Array.isArray(rotation))this.grips.set(name,{
            position:new THREE.Vector3().fromArray(position),rotation:new THREE.Quaternion().fromArray(rotation),
          });
        }
      }
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigRightHand")this.hand=object;
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigLeftHand")this.leftHand=object;
      if(object.name.replace(/[^a-z0-9]/gi,"").toLowerCase()==="mixamorighead")this.head=object;
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigLeftHandMiddle1")this.leftGrip=object;
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigRightHandMiddle1")this.rightGrip=object;
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigLeftHandThumb1")this.leftThumb=object;
      if(object.name.replace(/[^a-z0-9]/gi,"")==="mixamorigRightHandThumb1")this.rightThumb=object;
      if(object instanceof THREE.SkinnedMesh&&/teeth/i.test(object.name))this.teeth=object;
      if(object instanceof THREE.Mesh) {
        object.castShadow=false;object.receiveShadow=false;object.frustumCulled=false;
        if(object.morphTargetDictionary)this.faces.push(object);
        for(const mat of Array.isArray(object.material)?object.material:[object.material]) {
          // Hair cards and lashes need cutout depth, not transparent sorting.
          if(mat instanceof THREE.MeshStandardMaterial&&mat.transparent){
            if(mat.name.includes("high-poly")){mat.depthWrite=false;}
            else{mat.transparent=false;mat.alphaTest=.4;mat.depthWrite=true;}
            mat.needsUpdate=true;
          }
          if(mat instanceof THREE.MeshStandardMaterial&&mat.name.includes("grump"))mat.color.setRGB(.20,.15,.12);
        }
        this.sourceMaterials.set(object, object.material);
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => this.appearance.convert(material)) : this.appearance.convert(object.material);
        if(object.name.replace(/[^a-z0-9]/gi,"").toLowerCase()==="sponsorpatch") {
          const material = Array.isArray(object.material) ? object.material[0] : object.material;
          if (material instanceof THREE.MeshStandardMaterial) this.sponsorMaterial = material;
        }
      }
    });
    this.root.add(this.water,this.device,this.umbrella);
    this.water.visible=this.device.visible=this.umbrella.visible=false;
    if(withProps&&this.hand) {
      this.hand.add(this.water,this.device);
      this.water.position.set(0,.045,.022);this.device.position.set(0,.045,.014);
      this.water.visible=this.device.visible=false;
    }
    if(withProps){this.measureLips();this.bakeDrinkingHand();}
  }
  /** The standing pose the height calibration works from, and the pose a probe restores. */
  private poseIdle() {
    for(const [name,action] of this.actions) {
      action.enabled=name==="idle";action.setEffectiveWeight(name==="idle"?1:0);action.setEffectiveTimeScale(1);
      if(name==="idle")action.time=0;
    }
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    this.root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.update();});
  }
  /**
   * The lips, in head-local metres. The teeth ride the head rigidly, so the furthest of
   * them from the head joint is the front of the mouth, and a centimetre further out is
   * the lip a bottle touches. Measured from this character's own mesh, so a different
   * face moves the point instead of a constant in the code going stale.
   */
  private measureLips() {
    if(!this.head||!this.teeth)return;
    const teeth=this.teeth,head=this.head;
    this.root.updateMatrixWorld(true);
    const vertices=teeth.geometry.attributes.position as THREE.BufferAttribute;
    const point=new THREE.Vector3();
    // One combined matrix and a stride: this runs while he is being put on screen, and a
    // few hundred teeth locate a mouth as well as several thousand do.
    const toHead=new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(teeth.matrixWorld);
    const step=Math.max(1,Math.floor(vertices.count/600));
    const read=(index:number)=>teeth.applyBoneTransform(index,point.fromBufferAttribute(vertices,index)).applyMatrix4(toHead);
    let furthest=0;
    for(let index=0;index<vertices.count;index+=step)furthest=Math.max(furthest,read(index).length());
    if(furthest<=0)return;
    const front=new THREE.Vector3();
    let kept=0;
    for(let index=0;index<vertices.count;index+=step) {
      const local=read(index);
      if(local.length()>=furthest*.9){front.add(local);kept+=1;}
    }
    if(!kept)return;
    front.divideScalar(kept);
    this.lips=front.multiplyScalar(1+.012/front.length());
  }
  /** Where his lips are now. The head bone on its own sits inside the skull. */
  private mouthAt(target:THREE.Vector3) {
    if(!this.head)return target.set(0,0,0);
    return this.lips?this.head.localToWorld(target.copy(this.lips)):this.head.getWorldPosition(target);
  }
  /** Where a held object sits in a fist: the base of the middle finger, a quarter toward the thumb. */
  private palmAt(grip:THREE.Object3D,thumb:THREE.Object3D,target:THREE.Vector3) {
    return grip.getWorldPosition(target).lerp(thumb.getWorldPosition(this.thumbPoint),.25);
  }
  /**
   * Which hand the installed drink take raises, and how the bottle sits in it.
   *
   * The grips baked into the model were cut from the V2 right-handed pose. The V3 Mixamo
   * take drinks left-handed, so the bottle — and a premium sponsor's label on it — hung
   * at his side while he mimed a drink. The take is asked rather than told: whichever
   * hand reaches his mouth carries the bottle, so a right-handed take, which is what the
   * V2 fallback still plays, keeps its authored grip untouched.
   */
  private bakeDrinkingHand() {
    const window=propWindow("drink"),action=this.actions.get("drink");
    if(!window||!action||!this.head||!this.hand||!this.leftHand)return;
    if(!this.leftGrip||!this.rightGrip||!this.leftThumb||!this.rightThumb)return;
    const leftHand=this.leftHand,leftGrip=this.leftGrip,leftThumb=this.leftThumb;
    const pose=(seconds:number)=>{
      for(const [name,other] of this.actions) {
        other.enabled=name==="drink";other.setEffectiveWeight(name==="drink"?1:0);other.setEffectiveTimeScale(1);
      }
      action.time=Math.min(seconds/CLIP_DURATIONS.drink*action.getClip().duration,action.getClip().duration-1e-5);
      this.mixer.update(0);this.root.updateMatrixWorld(true);
    };
    pose((window.contact+window.release)/2);
    const mouth=this.mouthAt(new THREE.Vector3());
    const left=leftGrip.getWorldPosition(new THREE.Vector3()).distanceTo(mouth);
    const right=this.rightGrip.getWorldPosition(new THREE.Vector3()).distanceTo(mouth);
    if(right<=left){this.poseIdle();return;}
    // Upright in his own frame at the moment the bottle appears, and rigid in the fist
    // from there: it rises and turns with the hand, as a carried bottle does.
    pose(window.retrieve);
    this.drinking={
      hand:leftHand,palm:leftGrip,thumb:leftThumb,
      carried:{
        position:leftHand.worldToLocal(this.palmAt(leftGrip,leftThumb,new THREE.Vector3())),
        quaternion:leftHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.root.getWorldQuaternion(new THREE.Quaternion())),
      },
    };
    leftHand.add(this.water);
    this.poseIdle();
  }
  setAppearance(grade: VisualGrade) {
    this.appearance.update(grade);
  }
  hasClip(clip: CharacterClip) { return this.actions.has(clip); }
  availableClips() { return new Set(this.actions.keys()); }
  resolvedClip(clip: CharacterClip): CharacterClip {
    return clipFallbackChain(clip).find((candidate) => this.actions.has(candidate)) ?? "idle";
  }
  headPosition(target = new THREE.Vector3()) {
    return (this.head ?? this.root).getWorldPosition(target);
  }
  devicePosition(target = new THREE.Vector3()) {
    return this.device.getWorldPosition(target);
  }
  gazeAt(target: THREE.Vector3, weight = .6) {
    if (!this.head || !this.head.parent) return;
    this.root.updateMatrixWorld(true);
    const headPosition = this.head.getWorldPosition(new THREE.Vector3());
    const currentWorld = this.head.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(currentWorld);
    const delta = clampedLookDelta(forward, target.clone().sub(headPosition));
    const desiredWorld = delta.multiply(currentWorld);
    const parentWorld = this.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const desiredLocal = parentWorld.multiply(desiredWorld);
    this.head.quaternion.slerp(desiredLocal, THREE.MathUtils.clamp(weight, 0, 1));
    this.root.updateMatrixWorld(true);
  }
  sample(cue:CharacterCue,dt:number,snap=false,faceOffset=0) {
    const sampledClip=this.resolvedClip(cue.clip);
    if(!this.active)snap=true;
    if(this.active!==sampledClip) {
      this.previous=this.active;this.active=sampledClip;this.blend=snap?1:0;
    }
    this.blend=snap?1:Math.min(1,this.blend+Math.max(0,dt)/.28);
    for(const [name,action] of this.actions) {
      const current=name===this.active;
      action.enabled=current||(name===this.previous&&this.blend<1);
      action.setEffectiveWeight(current?smooth(this.blend):name===this.previous?1-smooth(this.blend):0);
      action.setEffectiveTimeScale(current ? cue.timeScale ?? 1 : 1);
      // Cue seconds are nominal manifest time; map them onto the take this character actually carries.
      if(current)action.time=Math.min(cue.seconds/CLIP_DURATIONS[cue.clip]*action.getClip().duration,action.getClip().duration-1e-5);
    }
    this.mixer.update(0);
    const t=cue.seconds,blinkPhase=(t+faceOffset)%3.7;
    const blink=blinkPhase>3.42?Math.sin((blinkPhase-3.42)/.28*Math.PI):0;
    const gesture=smooth(t/.85)*smooth((CLIP_DURATIONS[cue.clip]-t)/.85);
    const speaking=cue.clip==="talk";
    for(const mesh of this.faces) {
      const dictionary=mesh.morphTargetDictionary!,weights=mesh.morphTargetInfluences!;
      const set=(name:string,value:number)=>{if(dictionary[name]!==undefined)weights[dictionary[name]]=value;};
      set("blinkLeft",blink*.9);set("blinkRight",blink*.9);
      set("smile",.17+(cue.clip==="react"?.22:cue.clip==="greet"?.13:0)*gesture);
      set("speak",speaking?gesture*(.045+.11*Math.pow(Math.sin(t*9),2)):0);
      set("browLeft",speaking?.06*gesture:0);set("browRight",cue.clip==="react"?.10*gesture:0);
    }
    const prop=sampleProp(cue.clip,t);
    this.water.visible=this.propsEnabled&&prop.kind==="water"&&prop.visible;
    this.device.visible=this.propsEnabled&&prop.kind==="device"&&prop.visible;
    this.umbrella.visible=this.propsEnabled&&cue.clip==="umbrella_walk"&&this.actions.has("umbrella_walk");
    this.root.updateMatrixWorld(true);
    if(this.water.visible&&this.drinking) {
      const {hand,palm,thumb,carried}=this.drinking;
      // The rigid grip first, because its world pose is what the drinking placement eases
      // away from and back to. The cap is off in his hand, so the neck is what meets the lip.
      this.water.position.copy(carried.position);this.water.quaternion.copy(carried.quaternion);
      this.water.scale.setScalar(this.interactionUnit);
      this.water.getObjectByName("Bottle cap")!.visible=false;
      this.water.updateMatrixWorld(true);
      this.water.getWorldPosition(this.carriedPose.position);
      this.water.getWorldQuaternion(this.carriedPose.quaternion);
      const size=this.water.getWorldScale(this.propScale).x;
      const lifted=bottleAtLips(
        this.carriedPose,this.palmAt(palm,thumb,this.palmPoint),this.mouthAt(this.mouthPoint),
        this.bottleNeck*size,prop.reach,this.bottleBody*size,
      );
      this.water.position.copy(hand.worldToLocal(lifted.position));
      this.water.quaternion.copy(hand.getWorldQuaternion(this.handOrientation).invert().multiply(lifted.quaternion));
      this.water.updateMatrixWorld(true);
      return;
    }
    const grip=this.grips.get(cue.clip);
    if(grip&&(this.water.visible||this.device.visible)){
      const prop=this.water.visible?this.water:this.device;
      prop.position.copy(grip.position);prop.quaternion.copy(grip.rotation);
      if(this.water.visible){this.water.scale.setScalar(this.interactionUnit);this.water.getObjectByName("Bottle cap")!.visible=false;}
      return;
    }
    if(this.hand&&this.rightGrip) {
      this.root.getWorldQuaternion(this.orientation);
      this.hand.getWorldQuaternion(this.handOrientation).invert();
      if(this.device.visible&&this.leftGrip) {
        this.rightGrip.getWorldPosition(this.socketPoint);
        this.leftGrip.getWorldPosition(this.otherPoint);
        this.socketPoint.lerp(this.otherPoint,.5);
        this.socketPoint.add(new THREE.Vector3(0,0,.052).applyQuaternion(this.orientation));
        this.device.position.copy(this.hand.worldToLocal(this.socketPoint));
        this.device.quaternion.copy(this.handOrientation).multiply(this.orientation)
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,cue.clip==="photo"?Math.PI/2:0)));
      }
      if(this.water.visible) {
        this.rightGrip.getWorldPosition(this.socketPoint);
        this.socketPoint.add(new THREE.Vector3(-.012,-.125,.035).applyQuaternion(this.orientation));
        this.water.position.copy(this.hand.worldToLocal(this.socketPoint));
        this.water.quaternion.copy(this.handOrientation).multiply(this.orientation)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-.34*gesture));
      }
    }
  }
  async setSponsor(url?:string) {
    if(url===this.sponsorUrl)return;
    this.sponsorUrl=url;
    const revision=++this.sponsorRevision;
    this.sponsorTexture?.dispose();this.sponsorTexture=undefined;
    if(!this.sponsorMaterial)return;
    if(!url){this.sponsorMaterial.map=null;this.sponsorMaterial.color.setRGB(.035,.10,.105);this.sponsorMaterial.needsUpdate=true;return;}
    try{
      const texture=await new THREE.TextureLoader().loadAsync(url);
      if(revision!==this.sponsorRevision){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.flipY=false;
      this.sponsorTexture=texture;
      this.sponsorMaterial.map=texture;this.sponsorMaterial.color.set(0xffffff);this.sponsorMaterial.needsUpdate=true;
    }catch{/* The sewn patch remains visible when a remote logo cannot load. */}
  }
  /**
   * Premium placement: the water bottle he drinks from carries a sponsor's label.
   * Mirrors setSponsor exactly, including the generation guard, so a slow texture
   * arriving after the sponsor changed can never paint the wrong logo.
   */
  async setBottle(url?:string) {
    if(url===this.bottleUrl)return;
    this.bottleUrl=url;
    const revision=++this.bottleRevision;
    this.bottleTexture?.dispose();this.bottleTexture=undefined;
    const body=this.water.getObjectByName("Bottle body");
    const material=body instanceof THREE.Mesh?body.material:null;
    if(!(material instanceof THREE.MeshPhysicalMaterial))return;
    if(!url){material.map=null;material.color.set(0x68b5df);material.needsUpdate=true;return;}
    try{
      const texture=await new THREE.TextureLoader().loadAsync(url);
      if(revision!==this.bottleRevision){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.flipY=false;
      this.bottleTexture=texture;
      material.map=texture;material.color.set(0xffffff);material.needsUpdate=true;
    }catch{/* The plain bottle remains when a remote label cannot load. */}
  }
  dispose(){
    this.sponsorRevision+=1;this.sponsorTexture?.dispose();
    this.bottleRevision+=1;this.bottleTexture?.dispose();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);
    this.sourceMaterials.forEach((material, mesh) => { mesh.material = material; });
    this.appearance.dispose();
  }
}
