import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3114/preview/characters');await page.locator('[data-character-ready="true"]').waitFor({timeout:90000});
 for(const [action,time] of [['greet',1.5],['drink',2.5],['phone',2],['photo',2],['rest',2.5]]){
   await page.getByLabel('Preview action').selectOption(action);
   await page.getByLabel('Animation timeline').fill(String(time));
   await page.locator(`[data-clip="${action}"]`).waitFor();
   // Let a rendered frame consume the seek before inspecting it.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:`/tmp/character-${action}.png`});
 }
 assert.deepEqual(errors,[]);console.log('All action clips load and seek without browser exceptions.');
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Preview action').selectOption('encounter');
 await page.getByLabel('Animation timeline').fill('8');await page.locator('[data-resident-ready="true"]').waitFor({timeout:90000});
 await page.screenshot({path:'/tmp/character-mobile.png'});
 assert.equal(await page.getByRole('button',{name:'Play',exact:true}).count(),1,'Reduced-motion selection must remain paused');
 const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.content<=width.viewport);
 console.log('Mobile controls fit, and reduced-motion selections remain paused.');
}finally{await browser.close();}
