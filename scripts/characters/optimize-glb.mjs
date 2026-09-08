/** Lossless geometry; resample oversized texture maps and preserve alpha. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const paths=process.argv.slice(2);
if(!paths.length)throw new Error('Pass one or more GLB paths');
for(const path of paths) {
 const input=await readFile(path);
 if(input.readUInt32LE(0)!==0x46546c67)throw new Error('Not a GLB');
 const jsonLength=input.readUInt32LE(12),doc=JSON.parse(input.subarray(20,20+jsonLength));
 const binStart=20+jsonLength+8,bin=input.subarray(binStart),replacements=new Map();
 for(const image of doc.images??[]) {
   const view=doc.bufferViews[image.bufferView],data=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
   const meta=await sharp(data).metadata();
   const max=/hair|braid|grump/i.test(image.name)?1024:/eye|teeth/i.test(image.name)?512:1536;
   const pipeline=sharp(data).resize({width:max,height:max,fit:'inside',withoutEnlargement:true});
   const alpha=meta.hasAlpha;
   const result=await (alpha?pipeline.png({palette:true,quality:92,effort:10}):pipeline.jpeg({quality:85,mozjpeg:true})).toBuffer();
   replacements.set(image.bufferView,result);image.mimeType=alpha?'image/png':'image/jpeg';
 }
 let offset=0;const chunks=[],shared=new Map();
 for(const [index,view] of doc.bufferViews.entries()) {
   const data=replacements.get(index)??bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
   // glTF accessors determine vertex/index usage; the bufferView target hint
   // is optional. Identical byte ranges can safely share binary storage.
   delete view.target;
   const hash=createHash('sha256').update(data).digest('hex');
   if(shared.has(hash)){view.byteOffset=shared.get(hash);view.byteLength=data.length;continue;}
   shared.set(hash,offset);
   view.byteOffset=offset;view.byteLength=data.length;chunks.push(data);offset+=data.length;
   const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
 }
 doc.buffers[0].byteLength=offset;
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(offset,0);binaryHeader.writeUInt32LE(0x004e4942,4);
 await writeFile(path,Buffer.concat([header,json,binaryHeader,...chunks]));
 console.log(`${path}: ${(input.length/1048576).toFixed(2)} → ${((28+json.length+offset)/1048576).toFixed(2)} MiB`);
}
