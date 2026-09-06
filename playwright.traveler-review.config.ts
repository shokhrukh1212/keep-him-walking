import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/e2e",testMatch:"traveler-correction.spec.ts",workers:1,retries:0,timeout:90_000,
  reporter:"list",
  metadata:{actionReview:true},
  use:{baseURL:"http://127.0.0.1:3114",screenshot:"off",video:"off",trace:"off"},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"]}},{name:"phone",use:{...devices["iPhone 13"],browserName:"chromium"}}],
  webServer:{command:"VERCEL_ENV=preview VERCEL_GIT_COMMIT_REF=phase-3-launch-hardening pnpm dev --hostname 127.0.0.1 --port 3114",url:"http://127.0.0.1:3114",reuseExistingServer:false,timeout:120_000},
});
