# Phase 3 implementation evidence

Status on 2026-09-04: the non-payment Phase 3 implementation and automated technical gate pass on `phase-3-launch-hardening`. Production Supabase, Production Vercel variables and the Production deployment were not changed. The public-launch human gate remains open.

## Preview under test

- Immutable Preview: `https://keep-him-walking-a3lt1dfeh-shokhrukh-karimovs-projects.vercel.app`
- Deployment: `dpl_71S8AbqkCzFah8yTVzFyZXZ1ocHQ`, target `preview`, status `Ready`.
- Release: `8cb8e3e` with application functions in Vercel `syd1`, adjacent to isolated Supabase Preview project `pqtfhkiftiubwuwxnuzd` in `ap-southeast-2`.
- Vercel Deployment Protection remains enabled. Browser evidence used the existing automation bypass and the branch-only expiring application Preview session; neither value was printed or committed.

## Implemented

- Additive migrations 007–010 applied only to the isolated Supabase Preview: retention opt-ins, experiment exposure, incident/webhook audit, read-only runtime projection, one-call bootstrap bundle and atomic bootstrap admission control.
- Central distributed API limits with `Retry-After` semantics for high-risk/public endpoints. Rate-limit expiry cleanup no longer competes on the public request path.
- Sentry client/server/edge setup, Better Stack structured-log transport, correlation IDs, redaction, Web Vitals and `/api/health`; missing vendor credentials remain an intentional no-op.
- Protected non-Production country-pack preview with expiring HTTP-only signed sessions and a hard Production denial.
- Content/budget CLI, guarded 1,000-watcher load harness and aggregate sponsor CSV export.
- English-first dictionary contract, allowlisted deterministic experiments, tomorrow preview, UTC `.ics` download and provider-gated revocable notification preferences.
- Seven unpublished editorial-buffer packs: Sofia, Belgrade, Zagreb, Ljubljana, Vienna, Bratislava and Prague. See `docs/phase-3-cultural-review.md`.
- Launch, incident, rollback, sponsor-removal and webhook-replay runbooks plus launch metadata/error surfaces.

## Recorded verification

| Check | Result |
|---|---|
| `pnpm db:lint:phase3` | Pass; no schema findings on the isolated Preview database. |
| `pnpm db:test:phase3` | Pass; 61 total pgTAP assertions: Phase 1 10, Phase 1.5 4, Phase 2 24, Phase 3 23. |
| `pnpm test:coverage` | Pass; 27 files and 65 tests. Scoped coverage: 84.11% statements, 71.69% branches, 93.87% functions and 86.93% lines. |
| `pnpm lint` / `pnpm typecheck` | Pass without findings. |
| `pnpm build` | Pass; Next.js 16.3.3 emitted 31 static/dynamic routes. |
| `pnpm content:validate` | Pass; 16 registered packs and 717 uniquely owned scene assets. |
| `pnpm assets:report:phase2` | Pass; new packs are 2.70–4.00 MiB transfer and 24.5 MiB maximum decoded zone. |
| `pnpm test:e2e` | Pass; 28 active desktop/320px tests and 14 intentional opt-in rehearsal/soak/recording skips in 6.2 minutes. |
| `pnpm verify:phase3` | Pass end to end: lint, typecheck, coverage, production build, content and asset reports, isolated-project preflight, schema lint, 61 pgTAP assertions and the complete browser matrix. |
| Protected Preview recording | Pass; two projects (desktop and mobile) exercised the live Tashkent scene plus authenticated Sofia and Prague editorial previews. |
| 100-viewer traffic-model check | Pass; 400 requests, zero errors, 593 ms overall p95. Endpoint p95: bootstrap 800 ms, presence 588 ms, vote validation 576 ms, postcard validation 341 ms. |
| 1,000-viewer load gate | Pass; 30-second arrival ramp plus 60-second sustained window, 20-second heartbeats, 7,188 requests, zero errors, 560 ms overall p95. Endpoint p95: bootstrap 703 ms, presence 537 ms, vote validation 453 ms, postcard validation 392 ms. |

The production-shaped load model performs one bootstrap and one invalid-mutation validation per persistent anonymous viewer, then maintains presence at the application's heartbeat cadence. A deliberately unrealistic zero-ramp 100-viewer cold burst also produced zero errors but exceeded latency budget (2,849 ms overall p95; 3,470 ms bootstrap p95). This remains a documented burst-capacity caveat rather than being hidden by the passing sustained test.

Development-server Web Vitals are not representative production lab or field evidence. Physical-device Core Web Vitals and memory measurements are not claimed.

## Visual evidence

- Desktop video: `artifacts/phase3-preview-v1/phase3-preview-record-prot-2084b-g-and-live-journey-evidence-desktop-preview/video.webm`
- Mobile video: `artifacts/phase3-preview-v1/phase3-preview-record-prot-2084b-g-and-live-journey-evidence-mobile-preview/video.webm`
- Each directory also contains live Tashkent, Sofia and Prague screenshots captured from the protected deployed Preview.
- The prior immutable `bdd40e3` Preview was rechecked after deployment and returned healthy, providing a verified application rollback target without changing Production.

## Five-minute desktop check

1. Open the protected Preview and confirm the live Tashkent scene, traveler walk, moving world and compact walking rule.
2. Toggle reduced motion; confirm the complete static scene remains and continuous motion stops.
3. Open Passport, sponsor, privacy and tomorrow-calendar links; use keyboard-only navigation and inspect focus.
4. Enter the application Preview key at `/preview`, open Sofia and Prague, and scan all five zones in each.
5. Return to the journey, briefly go offline/online, and confirm the truthful reconnect state recovers without a blank scene.

## Ten-minute physical-phone check

1. Test once on a low/mid-range phone over mobile data and once over Wi-Fi; record model, OS, browser and connection.
2. Watch two minutes in full motion for foot contact, scene scale, parallax, culling, heat, memory pressure and sustained jank.
3. Stop and resume by backgrounding/foregrounding the tab; verify presence expiry does not leave false walking state.
4. Enable system reduced motion, reload and confirm the full environment, controls, dialogue and sponsor disclosure remain usable.
5. Rotate portrait/landscape, enlarge text, use screen-reader landmarks, vote, share/download a postcard and add the calendar file.
6. Capture LCP, INP and CLS if tooling is available; targets remain LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1.

## Open before public launch

- Configure named Sentry and Better Stack projects/recipients and prove test-alert delivery.
- Record representative physical low-/mid-range phone Core Web Vitals, memory and sustained-motion evidence.
- Complete the real Lemon Squeezy test checkout, signed delivery, duplicate delivery, refund and live-mode configuration.
- Obtain qualified local cultural review for the six Phase 2 provisional packs and all seven Phase 3 buffer packs before publication.
- Obtain product-owner acceptance of legal/contact copy.
- Resolve or explicitly accept the documented zero-ramp cold-burst capacity caveat before a coordinated traffic spike.
- Receive a separate explicit Production launch authorization. No launch date has been seeded.
