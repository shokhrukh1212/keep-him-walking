import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 if(process.argv.includes('--staged')){
  const body=await readFile('.cache/character-authoring/staged/v2/traveler.glb');
  await page.route('**/characters/v2/traveler.glb',route=>route.fulfill({contentType:'model/gltf-binary',body}));
 }
 await page.goto('http://localhost:3114/preview/characters');
 const stage=page.getByTestId('character-stage-3d');await expect(stage).toHaveAttribute('data-character-ready','true',{timeout:90000});
 for(const [view,action,time] of [['side','walk',.3],['back','greet',2.5],['three-quarter','talk',2]]){
  await page.getByLabel('Character view',{exact:true}).selectOption(view);
  await page.getByLabel('Preview action').selectOption(action);
  await page.getByLabel('Animation timeline').fill(String(time));
  await page.waitForTimeout(150);await page.screenshot({path:`/tmp/character-live-${view}-${action}.png`});
 }
 await page.getByLabel('Preview action').selectOption('encounter');
 await expect(stage).toHaveAttribute('data-resident-ready','true',{timeout:90000});
 // Sample the scene while it is actually playing, including multiple gait
 // cycles and one complete encounter. No video/soak recording is produced.
 const phases=new Set(),intervals=[];
 for(let i=0;i<30;i++){
  await page.waitForTimeout(1000);
  const data=await stage.evaluate(e=>({...e.dataset}));phases.add(data.clip);
  intervals.push(Number(data.cpuFrameMedianMs));
 }
 expect(phases.has('talk')).toBe(true);expect(phases.has('listen')).toBe(true);
 await page.getByLabel('Preview action').selectOption('walk');
 await page.getByLabel('Playback speed').selectOption('.25');
 await page.waitForTimeout(5000);
 await page.screenshot({path:'/tmp/character-live-quarter-walk.png'});
 console.log(JSON.stringify({browser:browser.version(),viewport:'1440x960 headless desktop; no physical phone',phases:[...phases],cpuFrameMedianMs:intervals.sort((a,b)=>a-b)[15],renderer:await stage.evaluate(e=>({...e.dataset}))},null,2));
 expect(errors).toEqual([]);
}finally{await browser.close();}
