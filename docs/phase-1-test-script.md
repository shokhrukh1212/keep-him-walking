# Phase 1 External Test Script

Do not coach testers on the walking rule before the comprehension question. Run this with 10–20 people, including at least one low-range and one mid-range physical phone.

## Preparation

1. Deploy the Phase 1 preview to Vercel and configure the Supabase and optional Vemetric environment values.
2. Seed an explicit 24-hour window: `pnpm seed:phase1 -- --starts-at <ISO-8601-UTC>`.
3. Confirm `/api/bootstrap` reports `mode: live`, the intended UTC window and no stale values.
4. Open the preview once with DevTools closed and confirm `scene_ready` reaches Vemetric.

## Tester session

1. Ask the tester to open the URL without further explanation.
2. Record whether the scene reaches a usable state on the first attempt and the approximate time until the traveler appears.
3. After 15–30 seconds ask: “In your own words, what makes him walk or stop?”
4. Ask the tester to find their contribution, open and submit the daily vote, mute sound, enable reduced motion, and find the dialogue/transcript.
5. On two coordinated devices, background one device and verify the other keeps the traveler moving. Then background the final device and verify idle appears after the configured TTL.
6. Ask what felt premium, what felt confusing, and what they expected to happen next.

## Required device evidence

Record device/browser, connection type, scene-ready time, LCP if available, sustained animation observation, orientation, any fallback used, and screenshots of defects. Never substitute fabricated analytics for missing observations.

## Passing gate

- 10–20 completed sessions.
- At least 90% reach a usable `scene_ready` state without help.
- At least 70% explain that at least one active watcher keeps him walking and that one person leaving does not stop him while another remains.
- No unresolved critical mobile, accessibility, synchronization, or truthfulness defect.
- Low-range and mid-range physical-phone evidence is present.
