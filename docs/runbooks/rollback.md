# Rollback runbook

- Application: promote the last known-good immutable Vercel deployment; do not rewrite Git history.
- Content: point affected `country_days.scene_pack_id` to the prior registered immutable pack after checking country/day identity.
- Preview seed: use the branch-specific guarded reset command, which checks the preview slug/project before deletion.
- Sponsorship: use emergency removal; runtime falls back to the explicit unsponsored state.
- Database: Phase 3 migration 007 is additive. Leave schema in place and disable new callers. Any destructive reversal requires a separately reviewed migration and backup.

After rollback, run `/api/health`, bootstrap/presence smoke, reduced-motion scene, vote read path and sponsor fallback before declaring recovery.
