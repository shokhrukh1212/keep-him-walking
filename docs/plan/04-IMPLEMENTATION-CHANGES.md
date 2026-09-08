# 04 — Implementation Changes

> For you and for Codex. Prompts in `07` implement these in order. This file is the
> "why and what"; the prompts are the "do".

## 1. Principles that do not change

- One authority row (`journey_runtime`), advanced inside a row lock, by `security definer`
  RPCs only. Browser never talks to RPCs. Every new number below lives there or in a
  table keyed to a `country_day`.
- One pure function from authoritative numbers to a frame. New inputs (distance, pace,
  scheduled crowd actions, weather, local hour) are *inputs to* `travelerMotionAt` /
  `routePositionAt`, never side channels.
- Client extrapolation capped at 60 s. Out-of-order updates ignored by `authoritativeAt`.
- No free text from visitors is ever stored or displayed. Reactions are enums;
  corrections go to a private queue.
- No cookie but the hashed visitor id. Country comes from the edge header and is stored as
  a 2-letter code on the lease, never with an IP.

## 2. Change list by priority

### P0 — credibility (before anything else)

| # | Change | Where |
|---|---|---|
| 1 | Delete the contact ground strip (`groundRoot`, `contactSprites`, `ground-1` usage) | `PixiScene` `buildZone` + per-frame update |
| 2 | Per-zone `stage` metadata in the schema with defaults; bottom-anchored panorama; character height from `personHeightFrac`; calibration overlay in the admin preview | `schema.ts`, `PixiScene`, `actor-layout.ts`, `ProductCharacterStage3D`, `/api/admin/preview` |
| 3 | Toon materials, outline, no tonemapping, palette-driven lights, Pixi contact shadow fed by the character stage, shared grade uniforms | `CharacterActor`, `ProductCharacterStage3D`, `PixiScene` |

### P0 — the new loop

| # | Change | Where |
|---|---|---|
| 4 | Distance-based route: zone `lengthMetres`, `global_distance_metres` in runtime, `routePositionAt(distance)`, beats pinned to metres, day goals, tileable scroll, dissolve transitions | migration, RPC `_v4`, `route clock`, `motion-clock`, `PixiScene`, HUD |
| 5 | Pace: server-side multiplier, exposed as `pace` + `paceRate`; client extrapolates distance at `1.25 × pace`; brisk clip ≥ 3× | RPC `_v4`, `presentation-clock`, actor |
| 6 | Waiting state: `waiting_since`, first-watcher detection (gap ≥ 10 min), card + share image | runtime columns, RPC, HUD, OG route |
| 7 | Watchers by country: `country_code` on leases; `country_day_watch` aggregate; HUD flags; leaderboard; `/country/<cc>` | migration, heartbeat handler, RPC, pages |
| 8 | Reactions: `POST /api/reactions` (enum), per-visitor cooldown via `consume_mutation_rate_limit`, window counters, threshold → `scheduled_actions(day_id, kind, at_active_second)`; bootstrap/heartbeat carry the next scheduled action; `motion-clock` merges crowd actions with beat actions | migration, RPC, route, motion-clock |
| 9 | Vote 2.0: candidates from `neighbours[]` ∩ ready packs (max 3); closes at rollover; Day 1 = name vote (`vote.kind = 'name'`); result feeds `reconcile_phase2_state` to pick tomorrow's pack; countdown | migration, rollover RPC, vote UI |
| 10 | Time of day + weather: local hour from the pack timezone; `city_weather` cached 10 min from Open-Meteo (server, `after()`/cron); grade filter keyframes; night cross-fade; particles | new table or runtime jsonb, `PixiScene`, HUD |
| 11 | Landing + HUD rewrite; dynamic OG image per day/state; share cards (steps, first-watcher, country, recap) | app pages, `/api/og/*` (Satori via `next/og`) |
| 12 | Recap page `/day/<n>` and admin "post kit" `/api/admin/postkit/<n>` returning the X text + image URL | pages, admin route |
| 13 | Sponsor pricing engine: `sponsor_pricing` (date, price_cents, basis_uniques, tier multipliers), 7-day window opened by rollover, public `/sponsors` page with the price and the formula, founding price flag, tiers | migration, rollover, checkout route, UI |
| 14 | Map page `/map` (SVG world map, path polyline, pulsing current city, tomorrow's candidates) | page, pack lat/lon |
| 15 | Performance & cost: meshopt-compressed GLBs, animation GLB split, dead assets deleted, adaptive heartbeat (20 s → 40 s when watchers > 500), bootstrap `Cache-Control: s-maxage=3, stale-while-revalidate=10`, static assets served from a free-egress bucket | build scripts, routes, `next.config` |
| 16 | Pack generator CLI (`pack:new`, `pack:build`) + stage defaults + validation of the safety fields | `scripts/` |

### P1 — first two weeks

17 Background walkers, birds, cat, tram, café steam, window lights, bunting at 100 watchers.
18 Locals' corrections: `POST /api/corrections` (city, zone, category enum, ≤ 280 chars — the *only* free text in the product, private, rate-limited, never rendered) + admin list + "Reviewed with help from N locals".
19 Notebook lines + personal postcard text.
20 Premium sponsor placements: bottle texture, café-sign texture slot on the near layer.
21 "Buy him a ticket" product (see `05`).
22 Passport polish: streaks, season sheet, share.

## 3. Data-model deltas (one migration, `0011_season1.sql`)

```sql
-- journey_runtime
alter table journey_runtime
  add column global_distance_metres double precision not null default 0,
  add column pace_rate real not null default 1,
  add column waiting_since timestamptz,
  add column last_watcher_left_at timestamptz,
  add column weather jsonb;                       -- {code, temp_c, wind_kmh, is_day, fetched_at}

-- presence_leases
alter table presence_leases add column country_code char(2);

-- per-day aggregates
create table country_day_watch (
  country_day_id uuid references country_days(id),
  country_code char(2) not null,
  watch_seconds integer not null default 0,
  peak_watchers integer not null default 0,
  primary key (country_day_id, country_code)
);

create table day_outcomes (
  country_day_id uuid primary key references country_days(id),
  distance_metres double precision not null,
  landmark_reached boolean not null,
  marathon boolean not null,
  peak_watchers integer not null,
  unique_watchers integer not null,
  countries_count integer not null,
  top_country char(2),
  recap_image_path text,
  computed_at timestamptz not null default now()
);

create type reaction_kind as enum ('wave','water','photo');
create table reaction_windows (                 -- 30-second buckets
  country_day_id uuid references country_days(id),
  kind reaction_kind not null,
  bucket_start timestamptz not null,
  count integer not null default 0,
  primary key (country_day_id, kind, bucket_start)
);
create table scheduled_actions (
  id bigserial primary key,
  country_day_id uuid references country_days(id),
  kind text not null,                            -- 'wave' | 'drink' | 'photo' | 'cheer' | 'stumble'
  at_active_second integer not null,             -- global_active_seconds at which to play
  source text not null default 'crowd',          -- 'crowd' | 'beat' | 'system'
  created_at timestamptz not null default now(),
  unique (country_day_id, at_active_second)
);

create table day_photos (
  id bigserial primary key,
  country_day_id uuid references country_days(id),
  at_distance_metres double precision not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- votes: candidates are packs; kind distinguishes the name vote
alter table votes add column kind text not null default 'destination';  -- 'destination' | 'name'
alter table vote_options add column pack_id text;                         -- null for name votes

-- sponsors
create table sponsor_pricing (
  day_date date primary key,
  price_cents integer not null,
  basis_uniques integer not null,
  founding boolean not null default false,
  opened_at timestamptz not null default now()
);
alter table sponsorships add column tier text not null default 'standard'; -- 'standard' | 'premium'

-- corrections (P1)
create table corrections (
  id bigserial primary key,
  pack_id text not null, zone_id text, category text not null,
  body text not null check (char_length(body) <= 280),
  visitor_hash text not null, country_code char(2),
  status text not null default 'new',
  created_at timestamptz not null default now()
);
```

RLS: same pattern as everything else — all tables revoked from `anon`/`authenticated`,
reachable only via `security definer` RPCs from `service_role`. pgTAP assertions added
for the two new invariants: `scheduled_actions.at_active_second` unique per day, and
`reaction_windows.count` never decremented.

## 4. RPC deltas

- `record_presence_heartbeat_v4(visitor_hash, session_id, visible, scene_ready, country_code)`
  - accrues `delta_seconds` exactly as v3;
  - computes `n = count(distinct visitor_hash)` of live leases **before** the upsert (so the caller counts), `pace = least(1 + log(2, greatest(n,1)), 5)`;
  - `global_distance_metres += delta_seconds × 1.25 × pace` (pace sampled at the start of the delta is fine — deltas are ≤ 20 s);
  - updates `country_day_watch` for the caller's country by its own visible delta (cap TTL);
  - sets `waiting_since = now()` when `n` goes 0, clears it when it goes > 0, and returns `woke_him = true` to the caller that made the transition after a gap ≥ 600 s;
  - returns `{global_active_seconds, global_distance_metres, pace, watchers, waiting_since, next_scheduled_action, weather}`.
- `submit_reaction(visitor_hash, day_id, kind)` — rate-limited through `consume_mutation_rate_limit` (1/60 s per kind per visitor), increments the current 30-s bucket, and if `count ≥ threshold(n)` (`greatest(2, ceil(0.3 × n))`) and no action of that kind is scheduled within the last 120 active seconds, inserts a `scheduled_actions` row at `global_active_seconds + 2` and resets the bucket.
- `reconcile_phase2_state` — additionally: close the vote, pick the winning pack (ties → fewest previous visits, then alphabetical), create tomorrow's `country_day` from it, write `day_outcomes` for the day just ended, compute tomorrow's `sponsor_pricing` and open `D+7`.
- `read_bootstrap_bundle_v5` — adds distance, pace, waiting, weather, next scheduled action, today's country top-5, sponsor price.

## 5. Client deltas

- `PresentationClock` gains a second track: `distance` with `rate = 1.25 × pace` while `traveling`, same easing rules, same 60-s cap.
- `routePositionAt(pack, distanceMetres)` replaces the seconds version; zones have `lengthMetres`; the landmark zone loops after the route completes (`phase: 'route' | 'evening'`).
- `motion-clock` takes `scheduledActions[]` and beats-by-metre; it aligns crowd actions to the 0.6-s plant grid exactly as beats are aligned today, so determinism is preserved.
- `travelerMotionAt(pack, rawSeconds, distanceMetres, scheduledActions)` — still pure.
- `PixiScene`: bottom-anchored panorama, tileable wrap, parallax multipliers, contact shadow ellipse driven by the character stage's published foot position, hourly grade filter, weather particles, night cross-fade.
- `ProductCharacterStage3D`: height from stage metadata, toon materials, lights from palette, publishes `{footX, footY, scale}`, receives grade uniforms, head look-at.
- HUD: flags, pace, goal bar, reactions, vote chip with countdown, weather.

## 6. Cost and load protection (this is where a viral day kills a $0 project)

| Risk | Mitigation |
|---|---|
| Vercel Hobby bandwidth (100 GB/month) — one viral day with a 4.6 MB GLB per visitor exceeds it | Compress GLB (meshopt/Draco) to ~1.5 MB, split animations, serve `/characters`, `/scenes`, `/audio` from a free-egress bucket (Cloudflare R2 free tier) behind a `assets.<domain>` host; `next.config` `assetPrefix`-style URL helper for packs. |
| Vercel Hobby terms are for non-commercial use — selling sponsorships is commercial | Move to Pro ($20/mo) with the first sponsor payment. Budget for it from day 1 revenue, not from your pocket. |
| Supabase free tier: 500 MB DB, 5 GB egress, project pauses after 7 days idle | Bootstrap payload < 6 KB; heartbeat response < 400 B; per-minute `step_buckets` only; `cleanup_phase2_retention` prunes leases hourly. Upgrade when sponsor money exists. |
| 100-viewer cold burst p95 2.8 s | Edge-cached bootstrap (`s-maxage=3`), `Retry-After` already exists, adaptive heartbeat interval from the server (`heartbeatSeconds` in the response: 20 → 30 → 40 as watchers pass 300 / 1000). |
| Open-Meteo rate limits (generous, non-commercial) | One fetch per city per 10 min, server-side, cached. |
| OG image generation load | Cache OG images per (day, state-bucket) for 60 s at the edge. |
| Reaction spam | Enum-only, cooldown, thresholds scale with `n`, one scheduled action per kind per 120 s. |
| Presence spoofing (many tabs) | Already `count(distinct visitor_hash)`; keep. Pace uses the same count. |

## 7. Delete list (P18, after P1–P3 are verified on a real phone)

- `SpriteTravelerRenderer.tsx`, `pixi-puppet.ts`, `puppet.ts`, `limb-skin.ts`, `RiveTravelerRenderer.tsx` and the `JourneyCharacter` contract, `spriteManifest` from packs + `rig-contract.ts` validation, `public/traveler/production/v2/*` except `actions/idle.webp` (still the loading placeholder), `public/characters/v1/`.
- Per zone: `distant.webp`, `architecture.webp`, `ground-1/2/3.webp`, prop cutouts, and their preload entries. Keep `fallback.webp` (renamed `day.webp`), add `night.webp` / `lights.webp` where present.
- Packs `tashkent-v2`, `tashkent-v3` (schema v2 rollback targets) once `tashkent-v5` with stage metadata is live.
- The `coherentPanorama` branch condition — there is only one renderer after this.

## 8. Test additions

- Unit: `routePositionAt` by metres incl. evening loop; `pace()` table; threshold table; motion-clock merge of crowd + beat actions never overlaps; `travelerMotionAt` determinism across two computations with scheduled actions.
- pgTAP: v4 accrual with pace; `waiting_since` transitions; reaction threshold; rollover picks the vote winner; pricing row for D+7 exists after rollover.
- Playwright: two contexts see the same crowd action at the same second; ground-line calibration renders feet on the line at 320 px and 1440 px; waiting → first-watcher card; country flags render with a forced header; recap page renders for a finished day; OG route returns an image.
- Load: repeat the 1,000-viewer gate with reactions at 5 % of viewers per minute.

## 9. Environment additions

```
ROLLOVER_UTC_HOUR=16
PACE_CAP=5
DAY_ROUTE_METRES=8000
MARATHON_METRES=42195
FIRST_WATCHER_GAP_SECONDS=600
WEATHER_PROVIDER=open-meteo
ASSET_BASE_URL=https://assets.<domain>
SPONSOR_FLOOR_CENTS=4900
SPONSOR_CENTS_PER_UNIQUE=1
SPONSOR_FOUNDING_CENTS=2900
SPONSOR_PREMIUM_MULTIPLIER=1.5
SPONSOR_WINDOW_DAYS=7
```
