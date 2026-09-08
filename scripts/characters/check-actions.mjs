import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const staged=process.argv.includes('--staged');
 const stagedInteractions=process.argv.includes('--interactions');
 const interactions=stagedInteractions||process.argv.includes('--served-interactions');
 const focused=process.argv.includes('--focused');
 const only=process.argv.includes('--clip')?process.argv[process.argv.indexOf('--clip')+1]:undefined;
 if(stagedInteractions){
   for(const role of ['traveler','almaty-host']){
     const body=await readFile(`.cache/character-authoring/action-review/v2/${role}.glb`);
     await page.route(`**/characters/*/${role}.glb*`,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body}));
   }
 }
 if(staged){
   const body=await readFile('.cache/character-authoring/staged/v2/traveler.glb');
   await page.route('**/characters/v2/traveler.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body}));
 }
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3114/preview/characters');await page.locator('[data-character-ready="true"]').waitFor({timeout:90000});
 for(const [action,time] of focused?[['greet',1.8],['drink',2.5],['phone',1.8]]:interactions?[['greet',1.8],['talk',1.7],['react',1.3],['goodbye',1.4],['drink',2.5],['phone',1.8],['photo',1.8],['encounter',12.2]]:[['idle',1.3],['walk',.3],['walk',.9],['greet',1.5],['drink',2.5],['phone',2],['photo',2],['rest',2.5]]){
   if(only&&action!==only)continue;
   await page.getByLabel('Preview action').selectOption(action);
   await page.getByLabel('Animation timeline').fill(String(time));
   await page.locator(`[data-clip="${action==='encounter'?'listen':action}"]`).waitFor();
   if(action==='encounter')await page.locator('[data-resident-ready="true"]').waitFor({timeout:90000});
   // Let a rendered frame consume the seek before inspecting it.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:`/tmp/${interactions?'interaction-':staged?'staged-':''}character-${action}-${String(time).replace('.','_')}.png`});
 }
 assert.deepEqual(errors,[]);console.log(`${only??'All action clips'} load and seek without browser exceptions.`);
 if(interactions){
   for(const [view,action,time] of [['side','drink',2.5],['three-quarter','phone',1.8],['side','photo',1.8],['front','greet',.45],['front','greet',4.4],['side','drink',1],['front','phone',.6]]){
     if(only&&action!==only)continue;
     await page.getByLabel('Preview action').selectOption(action);
     await page.getByLabel('Show local resident').uncheck();
     await page.getByLabel('Character view',{exact:true}).selectOption(view);
     await page.getByLabel('Animation timeline').fill(String(time));
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     await page.screenshot({path:`/tmp/interaction-${view}-${action}-${time}.png`});
   }
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Preview action').selectOption('encounter');
 await page.getByLabel('Animation timeline').fill('8');await page.locator('[data-resident-ready="true"]').waitFor({timeout:90000});
 await page.screenshot({path:'/tmp/character-mobile.png'});
 assert.equal(await page.getByRole('button',{name:'Play',exact:true}).count(),1,'Reduced-motion selection must remain paused');
 const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.content<=width.viewport);
 console.log('Mobile controls fit, and reduced-motion selections remain paused.');
}finally{await browser.close();}
