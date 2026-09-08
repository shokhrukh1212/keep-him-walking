import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3114/preview/characters');
 await page.locator('[data-character-ready="true"]').waitFor({timeout:90000});
 const supported=await page.locator('canvas').evaluate(canvas=>{
   const extension=canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
   if(!extension)return false;
   window.characterLossExtension=extension;extension.loseContext();return true;
 });
 if(supported){
   await expect(page.getByRole('status',{name:'Renderer status'})).toContainText('interrupted');
   await expect(page.getByAltText('Original traveler reference',{exact:true})).toBeVisible();
   await page.evaluate(()=>window.characterLossExtension.restoreContext());
   await expect(page.getByRole('status',{name:'Renderer status'})).toContainText('restored',{timeout:20000});
   console.log('Context loss shows reference; context restoration resumes rendering.');
 }
 await page.getByRole('button',{name:'Reload characters'}).click();
 await page.locator('[data-character-ready="true"]').waitFor({timeout:90000});
 await expect(page.locator('canvas')).toHaveCount(1);
 expect(errors).toEqual([]);
 const failure=await browser.newPage();
 await failure.route('**/characters/v2/traveler.glb*',route=>route.abort());
 await failure.goto('http://localhost:3114/preview/characters');
 await failure.locator('[data-character-error="true"]').waitFor({timeout:30000});
 await expect(failure.getByAltText('Original traveler reference',{exact:true})).toBeVisible();
 const unsupported=await browser.newPage();
 await unsupported.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};
 });
 await unsupported.goto('http://localhost:3114/preview/characters');
 await expect(unsupported.getByRole('status',{name:'Renderer status'})).toContainText('3D is unavailable',{timeout:30000});
 await expect(unsupported.getByAltText('Original traveler reference',{exact:true})).toBeVisible();
 console.log('Reload keeps one canvas; missing asset and unavailable WebGL show the original reference.');
}finally{await browser.close();}
