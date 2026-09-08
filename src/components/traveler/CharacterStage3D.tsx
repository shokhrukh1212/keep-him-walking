"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CharacterActor } from "@/lib/characters/actor";
import { CHARACTER_CANDIDATES, CHARACTER_MANIFEST, type CharacterCandidate, type ReviewAction } from "@/lib/characters/manifest";
import { reviewDuration, sampleScene, type SceneCue } from "@/lib/characters/timeline";

export type CharacterPlayback = { action: ReviewAction; playing: boolean; speed: number; seek: number; revision: number };
type Props = { candidate: CharacterCandidate; view: string; showNpc: boolean; playback: CharacterPlayback;
  onStatus: (status:string)=>void; onProgress:(seconds:number,cue:SceneCue)=>void;
  onAvailability:(available:boolean)=>void };

function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object=>{
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)?object.material:[object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if(value instanceof THREE.Texture) textures.add(value);
    }
    if(object instanceof THREE.SkinnedMesh)object.skeleton.dispose();
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  textures.forEach(t=>{t.dispose();if(typeof ImageBitmap!=="undefined"&&t.image instanceof ImageBitmap)t.image.close();});
}
function stool() {
  const group=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:0x75513b,roughness:.86});
  const add=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wood);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  };
  add(.46,.045,.44,0,.46,0);
  for(const x of [-.19,.19])for(const z of [-.17,.17])add(.035,.44,.035,x,.22,z);
  return group;
}

export function CharacterStage3D(props:Props) {
  const host=useRef<HTMLDivElement>(null),latest=useRef(props);
  useEffect(()=>{latest.current=props;},[props]);
  useEffect(()=>{
    const element=host.current;if(!element)return;
    let disposed=false,raf=0,lostContext=false;
    const scene=new THREE.Scene();
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"high-performance"});}
    catch{latest.current.onStatus("3D is unavailable on this device. Showing the original traveler reference.");latest.current.onAvailability(false);element.dataset.characterError="true";return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute("aria-label","3D traveler and local resident");element.appendChild(renderer.domElement);
    const camera=new THREE.OrthographicCamera(-2,2,2,-1,.01,40);
    scene.add(new THREE.HemisphereLight(0xe5efff,0x786344,1.6));
    const key=new THREE.DirectionalLight(0xffedda,2.5);
    key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});
    key.shadow.normalBias=.003;key.shadow.bias=-.0001;key.shadow.radius=3;scene.add(key);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.ShadowMaterial({opacity:.24}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.003;scene.add(floor);
    const traveler=new THREE.Group(),resident=new THREE.Group(),seat=stool();scene.add(traveler,resident,seat);
    const loader=new GLTFLoader();let actor:CharacterActor|undefined,npc:CharacterActor|undefined;
    let seconds=0,last=0,lastRender=0,lastReport=-Infinity,revision=-1,action:ReviewAction="idle",npcRequested=false;
    const cpuFrames:number[]=[];
    const load=async(kind:"traveler"|"resident")=>{
      let root:THREE.Group|undefined;
      try{
        const manifest=CHARACTER_MANIFEST[kind];
        const candidate=CHARACTER_CANDIDATES[latest.current.candidate];
        const url=kind==="traveler"?candidate.travelerUrl:candidate.residentUrl;
        const gltf=await loader.loadAsync(url);root=gltf.scene;
        if(disposed){disposeModel(root);return;}
        const model=new CharacterActor(gltf,manifest.heightMetres,kind==="traveler");
        if(kind==="traveler"){actor=model;traveler.add(model.root);element.dataset.characterReady="true";latest.current.onAvailability(true);}
        else{npc=model;resident.add(model.root);element.dataset.residentReady="true";}
        latest.current.onStatus("Model loaded. Character art and animation repairs are still in progress.");
      }catch(error){
        if(root)disposeModel(root);
        if(!disposed){if(kind==="traveler")latest.current.onAvailability(false);element.dataset.characterError="true";latest.current.onStatus(error instanceof Error?error.message:"The character could not load. Reload to retry.");}
      }
    };
    void load("traveler");
    const resize=()=>{
      const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;
      renderer.setSize(width,height);
      const vertical=width<=600?4.2:2.55,aspect=width/height;
      camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
      camera.position.set(0,vertical/2-.20,6);camera.lookAt(0,vertical/2-.20,0);camera.updateProjectionMatrix();
    };
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const draw=(now:number)=>{
      if(disposed)return;raf=requestAnimationFrame(draw);
      if(document.hidden||lostContext){last=now;return;}
      if(now-lastRender<(element.clientWidth<=600?1000/30:1000/60)-1)return;
      const frameStart=performance.now();
      const dt=last?Math.min(.1,(now-last)/1000):0;last=now;lastRender=now;
      const state=latest.current,p=state.playback,pair=state.showNpc||p.action==="encounter";
      const snap=revision!==p.revision||action!==p.action;
      if(snap){seconds=Math.max(0,Math.min(reviewDuration(p.action),p.seek));revision=p.revision;action=p.action;}
      else if(p.playing&&actor&&(!pair||npc))seconds=(seconds+dt*p.speed)%reviewDuration(action);
      const cue=sampleScene(action,seconds);
      actor?.sample(cue.traveler,dt,snap);npc?.sample(cue.resident,dt,snap,1.8);
      const yaw=({front:0,"three-quarter":-.5,side:Math.PI/2,back:Math.PI} as Record<string,number>)[state.view]??0;
      traveler.rotation.y=action==="encounter"?cue.travelerYaw:yaw;
      traveler.position.x=pair?cue.travelerX:element.clientWidth<=600?0:.25;
      resident.visible=pair;resident.position.x=.65;resident.rotation.y=action==="encounter"?cue.residentYaw:-.6;
      seat.visible=action==="rest";seat.position.x=traveler.position.x;seat.rotation.y=traveler.rotation.y;
      camera.zoom=cue.cameraZoom;
      // Focus must not push the shared floor below the mobile viewport.
      const vertical=element.clientWidth<=600?4.2:2.55;
      const cameraY=vertical/(2*camera.zoom)-.20;
      camera.position.y=cameraY;camera.lookAt(0,cameraY,0);camera.updateProjectionMatrix();
      if(pair&&!npcRequested){npcRequested=true;void load("resident");}
      renderer.render(scene,camera);
      cpuFrames.push(performance.now()-frameStart);if(cpuFrames.length>120)cpuFrames.shift();
      if(snap||now-lastReport>100){
        lastReport=now;state.onProgress(seconds,cue);element.dataset.clip=cue.traveler.clip;
        element.dataset.drawCalls=String(renderer.info.render.calls);element.dataset.triangles=String(renderer.info.render.triangles);
        const sorted=[...cpuFrames].sort((a,b)=>a-b);
        element.dataset.cpuFrameMedianMs=sorted[Math.floor(sorted.length*.5)]?.toFixed(2);
        element.dataset.cpuFrameP95Ms=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]?.toFixed(2);
      }
    };
    raf=requestAnimationFrame(draw);
    const lost=(event:Event)=>{event.preventDefault();lostContext=true;renderer.domElement.style.visibility="hidden";latest.current.onAvailability(false);latest.current.onStatus("3D rendering was interrupted. Waiting for the graphics context…");};
    const restored=()=>{lostContext=false;last=0;renderer.domElement.style.visibility="visible";latest.current.onAvailability(!!actor);latest.current.onStatus("3D rendering restored.");};
    renderer.domElement.addEventListener("webglcontextlost",lost);renderer.domElement.addEventListener("webglcontextrestored",restored);
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);observer.disconnect();actor?.dispose();npc?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost",lost);renderer.domElement.removeEventListener("webglcontextrestored",restored);
      disposeModel(scene);key.shadow.dispose();renderer.dispose();renderer.domElement.remove();
    };
  },[]);
  return <div ref={host} data-testid="character-stage-3d" style={{position:"absolute",inset:0}} />;
}
