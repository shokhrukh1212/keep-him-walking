import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/e2e",testMatch:"traveler-correction.spec.ts",workers:1,retries:0,
  timeout:45_000,reporter:"list",
  use:{baseURL:process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",screenshot:"off",video:"off",trace:"off"},
  projects:[{name:"desktop",use:{viewport:{width:1440,height:900}}},{name:"phone",use:{viewport:{width:390,height:844}}}],
});
