import {test,expect} from "@playwright/test";
import {offlineBootstrapSnapshot} from "../../src/lib/bootstrap/offline";
import {bishkekCountryPackV1 as bishkekCountryPack} from "../../src/content/countries/bishkek.v1";
import {DEMO_LOGO} from "../../src/lib/traveler/demo-sponsor";
import {travelerMotionAt} from "../../src/lib/traveler/motion-clock";

test("connected puppet advances, rests, resumes and keeps controls compact",async({page},testInfo)=>{
  let raw=30,walking=true;
  let anchoredAt=Date.now();
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/**",async route=>{
    const time=Date.now(), seconds=raw+(walking?(time-anchoredAt)/1000:0);
    if(route.request().url().includes("/bootstrap")) {
      const snapshot=offlineBootstrapSnapshot(new Date(time));
      await route.fulfill({json:{...snapshot,mode:"live",assets:bishkekCountryPack,
        countryDay:{...snapshot.countryDay,id:"test-day",cityName:"Bishkek",scenePackId:bishkekCountryPack.assetVersion},
        sponsor:{status:"sponsored",publicId:"local-fixture-only",name:"Demo fixture",disclosure:"Local automated fixture",patchUrl:DEMO_LOGO,tier:"standard",bottleUrl:null,ctaLabel:"Explore sponsorship",clickUrl:"/sponsors"},
        refresh:{nextAt:null,afterMs:300_000,reason:"none"},presence:{status:"live",activeViewers:walking?1:0,ttlSeconds:50},
        route:{globalActiveSeconds:seconds,globalDistanceMetres:seconds*1.25,paceRate:1,walking,authoritativeAt:new Date(time).toISOString()}}});
    } else if(route.request().url().includes("/presence/heartbeat")) {
      await route.fulfill({json:{countryDayId:"test-day",serverNow:new Date(time).toISOString(),realServerNow:new Date(time).toISOString(),activeViewers:walking?1:0,walking,globalSteps:0,visitorActiveSeconds:5,ttlSeconds:50,nextHeartbeatInMs:20_000,globalActiveSeconds:seconds,globalDistanceMetres:seconds*1.25,paceRate:1,routeAuthoritativeAt:new Date(time).toISOString()}});
    } else await route.fulfill({json:{ok:true}});
  });
  await page.goto("/");
  const stage=page.locator(".pixi-scene");
  await expect(stage).toHaveAttribute("data-character-state","walk",{timeout:25_000});
  await expect(page.locator(".traveler-safe-fallback")).toHaveCount(0);
  await expect(stage).toHaveAttribute("data-sponsor-attached","true");
  expect(Number(await stage.getAttribute("data-character-texture-bytes"))).toBeLessThan(32*1024*1024);
  const start=Number(await stage.getAttribute("data-ground-pixels"));
  await expect.poll(async()=>Number(await stage.getAttribute("data-ground-pixels"))).toBeGreaterThan(start+20);
  await expect(page.locator("#journey-details")).toBeHidden();
  await page.getByRole("button",{name:"Journey details"}).click();
  await expect(page.locator("#journey-details")).toBeVisible();
  await page.getByRole("button",{name:"Close details"}).click();
  raw=35;walking=false;anchoredAt=Date.now();
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(stage).toHaveAttribute("data-character-state","idle");
  walking=true;anchoredAt=Date.now();
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));
  await expect(stage).toHaveAttribute("data-character-state","walk");
  for(const kind of ["photo","drink","phone"]) {
    let at=0;
    while(at<6_500&&travelerMotionAt(bishkekCountryPack,at).action?.kind!==kind)at+=0.1;
    expect(at).toBeLessThan(6_500);
    raw=at+1.25;anchoredAt=Date.now();
    await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    await expect(stage).toHaveAttribute("data-character-state",kind);
    await expect(stage).toHaveAttribute("data-sponsor-attached","true");
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(page.locator("main")).toHaveAttribute("data-motion","reduced");
  await expect(page.locator(".static-scene img")).toBeAttached();
  const selector=page.getByRole("combobox",{name:"Preview action"});
  if(testInfo.config.metadata.actionReview)await expect(selector).toBeVisible();
  if(await selector.count()) {
    await page.emulateMedia({reducedMotion:"no-preference"});
    for(const action of ["idle","walk","photo","drink","phone","wave","talk","listen","react","rest","sit","goodbye"]) {
      await selector.selectOption(action);
      await expect(stage).toHaveAttribute("data-action-review","true");
      await expect(stage).toHaveAttribute("data-character-state",action);
      await expect(stage).toHaveAttribute("data-sponsor-attached","true");
      if(action==="talk") {
        const height=await page.locator(".npc-wrap").evaluate(node=>node.getBoundingClientRect().height);
        expect(height).toBeGreaterThan(200);
        await expect(page.locator(".dialogue-bubble")).toContainText("Local animation test");
      }
    }
    await selector.selectOption("auto");
    await expect(stage).toHaveAttribute("data-action-review","false");
  }
  expect(errors).toEqual([]);
});
