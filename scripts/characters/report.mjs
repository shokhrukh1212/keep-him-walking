import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const clips={idle:4,walk:1.2,greet:3,talk:4,listen:4,react:3,goodbye:3,drink:5.5,phone:4.5,photo:4,rest:5};
let total=0;
for(const name of ['traveler','almaty-host']) {
 const file=await readFile(`public/characters/v1/${name}.glb`);total+=file.length;
 assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(8),file.length);
 const size=file.readUInt32LE(12),doc=JSON.parse(file.subarray(20,20+size));
 const binLength=file.readUInt32LE(20+size);
 for(const view of doc.bufferViews)assert.ok((view.byteOffset??0)+view.byteLength<=binLength,'Buffer view out of bounds');
 for(const [key,duration] of Object.entries(clips)) {
  const clip=doc.animations.find(a=>a.name===key);assert.ok(clip,`${name}: missing ${key}`);
  const actual=Math.max(...clip.samplers.map(s=>doc.accessors[s.input].max[0]));
  assert.ok(Math.abs(actual-duration)<.001,`${name}/${key}: expected ${duration}, got ${actual}`);
 }
 const joints=doc.skins.flatMap(s=>s.joints.map(j=>doc.nodes[j].name));
 for(const joint of ['Head','LeftHand','RightHand','LeftFoot','RightFoot'])assert.ok(joints.some(n=>n.endsWith(joint)),`Missing ${joint}`);
 assert.ok(doc.meshes.some(m=>m.extras?.targetNames?.includes('blinkLeft')),'Missing facial controls');
 assert.ok(doc.materials.filter(m=>m.name.endsWith('.body')).every(m=>!m.alphaMode||m.alphaMode==='OPAQUE'),'Skin must write opaque depth');
 const triangles=doc.meshes.reduce((n,m)=>n+m.primitives.reduce((k,p)=>k+(p.indices!==undefined?doc.accessors[p.indices].count:doc.accessors[p.attributes.POSITION].count)/3,0),0);
 console.log(`${name}: ${(file.length/1048576).toFixed(2)} MiB, ${Math.round(triangles)} triangles, ${doc.animations.length} clips`);
}
assert.ok(total<=8*1048576,`Combined character budget exceeded: ${total} bytes`);
console.log(`Combined ${(total/1048576).toFixed(2)} MiB / 8 MiB. Visual acceptance is a separate check.`);
