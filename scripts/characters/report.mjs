import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const core={idle:4,walk:1.2,greet:3,talk:4,listen:4,react:3,goodbye:3,drink:5.5,phone:4.5,photo:4,rest:5};
const assets=[
 {role:'traveler',path:'public/characters/v2/traveler.glb',clips:{...core,greet:4.8,notice:1,stop:1.2,turn:1.2,resume:1.2}},
 {role:'almaty-host',path:'public/characters/v1/almaty-host.glb',clips:core},
];
let total=0,totalGpu=0;
for(const asset of assets) {
 const file=await readFile(asset.path);total+=file.length;
 assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);
 const size=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+size));
 const binLength=file.readUInt32LE(20+size),bin=file.subarray(28+size,28+size+binLength);
 for(const view of doc.bufferViews)assert.ok((view.byteOffset??0)+view.byteLength<=binLength,'Buffer view out of bounds');
 for(const [key,duration] of Object.entries(asset.clips)) {
  const clip=doc.animations.find(a=>a.name===key);assert.ok(clip,`${asset.role}: missing ${key}`);
  const actual=Math.max(...clip.samplers.map(s=>doc.accessors[s.input].max[0]));
  assert.ok(Math.abs(actual-duration)<.001,`${asset.role}/${key}: expected ${duration}, got ${actual}`);
 }
 const joints=doc.skins.flatMap(s=>s.joints.map(j=>doc.nodes[j].name));
 for(const joint of ['Head','LeftHand','RightHand','LeftFoot','RightFoot'])assert.ok(joints.some(n=>n.endsWith(joint)),`Missing ${joint}`);
 assert.ok(doc.meshes.some(m=>m.extras?.targetNames?.includes('blinkLeft')),'Missing facial controls');
 assert.ok(doc.materials.filter(m=>m.name.endsWith('.body')).every(m=>!m.alphaMode||m.alphaMode==='OPAQUE'),'Skin must write opaque depth');
 const triangles=doc.meshes.reduce((n,m)=>n+m.primitives.reduce((k,p)=>k+(p.indices!==undefined?doc.accessors[p.indices].count:doc.accessors[p.attributes.POSITION].count)/3,0),0);
 let textureBytes=0,gpuBytes=0;const dimensions=[];
 for(const image of doc.images??[]) {
  const view=doc.bufferViews[image.bufferView],data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const meta=await sharp(data).metadata();textureBytes+=view.byteLength;
  if(meta.width&&meta.height){gpuBytes+=meta.width*meta.height*4;dimensions.push(`${meta.width}×${meta.height}`);}
 }
 totalGpu+=gpuBytes;
 const draws=doc.meshes.reduce((n,m)=>n+m.primitives.length,0);
 console.log(`${asset.role}: ${(file.length/1048576).toFixed(2)} MiB (${(textureBytes/1048576).toFixed(2)} MiB textures), ${Math.round(triangles)} triangles, ${draws} mesh primitives, ${doc.animations.length} clips`);
 console.log(`  texture dimensions: ${[...new Set(dimensions)].join(', ')}; uncompressed RGBA estimate ${(gpuBytes/1048576).toFixed(2)} MiB`);
}
assert.ok(total<=8*1048576,`Combined character budget exceeded: ${total} bytes`);
console.log(`Combined ${(total/1048576).toFixed(2)} MiB / 8 MiB; approximate uncompressed texture memory ${(totalGpu/1048576).toFixed(2)} MiB. Visual acceptance is a separate check.`);
