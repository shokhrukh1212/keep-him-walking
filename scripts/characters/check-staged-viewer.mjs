/** Same staged GLB, same lighting: compare minimal playback with app playback. */
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:900,height:900}});
 const body=await readFile('.cache/character-authoring/staged/v2/traveler.glb');
 await page.route('http://character.local/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/traveler.glb')return route.fulfill({contentType:'model/gltf-binary',body});
  if(path.startsWith('/three/'))return route.fulfill({contentType:'text/javascript',body:await readFile('node_modules/three/'+path.slice(7))});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;background:#d3d5cf}</style>
   <script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
   <script type="module">
   import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
   const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(900,900);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.275,1.275,2.35,-.20,.01,40);camera.position.z=6;
   scene.add(new THREE.HemisphereLight(0xe5efff,0x786344,1.6));const key=new THREE.DirectionalLight(0xffedda,2.5);key.position.set(-3,5,4);scene.add(key);
   const gltf=await new GLTFLoader().loadAsync('/traveler.glb');scene.add(gltf.scene);const mixer=new THREE.AnimationMixer(gltf.scene);
   const actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
   window.sample=(name,time,yaw=0)=>{mixer.stopAllAction();const action=actions[name];action.play();action.time=time;mixer.update(0);gltf.scene.rotation.y=yaw;renderer.render(scene,camera)};
   window.sample('idle',0);const bounds=new THREE.Box3().setFromObject(gltf.scene),scale=1.78/(bounds.max.y-bounds.min.y);gltf.scene.scale.multiplyScalar(scale);gltf.scene.position.y-=bounds.min.y*scale;window.sample('greet',1.5);window.ready=true;
   </script>`});
 });
 await page.goto('http://character.local/');await page.waitForFunction(()=>window.ready);
 await page.screenshot({path:'/tmp/staged-minimal-greet.png'});
 await page.evaluate(()=>window.sample('walk',.3,Math.PI/2));await page.screenshot({path:'/tmp/staged-minimal-walk-side.png'});
 console.log('Staged GLB rendered in minimal Three.js viewer without CharacterActor or material overrides.');
}finally{await browser.close();}
