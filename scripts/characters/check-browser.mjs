import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('http://127.0.0.1:3114/preview/characters');
 await page.locator('[data-character-ready="true"]').waitFor({timeout:90000});
 await page.screenshot({path:'/tmp/character-front-new.png'});
 await page.getByLabel('Review setting').selectOption('almaty');
 await page.screenshot({path:'/tmp/character-almaty-new.png'});
 await page.getByLabel('Review setting').selectOption('studio');
 await page.getByLabel('Preview action').selectOption('walk');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByLabel('Character view',{exact:true}).selectOption('side');
 await page.getByLabel('Animation timeline').fill('0.3');
 await page.screenshot({path:'/tmp/character-walk-new.png'});
 await page.getByLabel('Preview action').selectOption('encounter');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByLabel('Animation timeline').fill('8');
 await page.locator('[data-resident-ready="true"]').waitFor({timeout:90000});
 await page.screenshot({path:'/tmp/character-pair-new.png'});
 console.log(await page.locator('[data-testid="character-stage-3d"]').evaluate(e=>({...e.dataset})));
}finally{await browser.close();}
