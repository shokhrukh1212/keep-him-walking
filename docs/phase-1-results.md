# Phase 1 External Test Results

Status: **Database verification complete; external human/device gate not run — Phase 2 remains blocked.**

The configured Supabase project was confirmed empty, received the three Phase 1/1.5 migrations, passed remote schema lint and passed all 14 rollback-protected pgTAP assertions on 2026-08-31. Docker is not required: `pnpm db:lint:remote` and `pnpm db:test:remote` use the configured `SUPABASE_DB_URL`. External comprehension and physical-device evidence are still required.

## Summary

| Measure | Required | Observed |
|---|---:|---:|
| Completed testers | 10–20 | Pending |
| Reached `scene_ready` without help | ≥90% | Pending |
| Correctly explained shared walking rule | ≥70% | Pending |
| Critical defects remaining | 0 | Pending |
| Low-range physical phones | ≥1 | Pending |
| Mid-range physical phones | ≥1 | Pending |

## Session log

| Tester | Device/browser | Connection | Scene-ready/LCP | Rule correct? | Vote/mute/motion/transcript | Defects/notes |
|---|---|---|---|---|---|---|
| 01 | Pending | Pending | Pending | Pending | Pending | Pending |

## Defects and disposition

Record reproducible steps, severity, owner, fix verification and any remaining risk. Do not mark the exit gate complete until every required row above has evidence and no critical defect remains.

## Gate decision

- [ ] Product comprehension passed.
- [ ] Reliability passed.
- [ ] Mobile performance evidence captured.
- [ ] Accessibility/synchronization/truthfulness defects cleared.
- [ ] Phase 1 exit gate approved; Phase 2 may begin.
