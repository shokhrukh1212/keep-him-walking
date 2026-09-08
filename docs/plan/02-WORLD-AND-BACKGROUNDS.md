# 02 — The World and the Backgrounds

> The scene is currently one painting per zone, cover-scaled ×1.1, sliding across the
> screen over 150 seconds, with a ghost strip on top and a man floating in front of it.
> This file specifies what replaces that. Engineering detail is in `04` and Prompt P1–P4, P10–P11.

## 1. Why it feels boring (honest diagnosis from the screenshots)

1. **Nothing changes at the timescale a visitor watches.** A visitor stays 1–5 minutes.
   In that window the painting slides a few hundred pixels and one ambient action fires.
2. **The world does not react to the visitor** — not to the count, not to time, not to weather.
3. **The 3D character and the painted city are two different images.** Different
   rendering language, wrong scale, wrong ground, a shadow that lands nowhere. The eye
   never accepts him as *in* the place, so there is nothing to look at.
4. **Every city is the same shape at the same rhythm** (five zones, 150 s each). Zones
   change every 2.5 minutes; that is the only event.
5. **Nothing is alive in the painting.** No people (correctly — AI people are creepy),
   but also no birds, cats, trams, leaves, smoke, flags, window lights.

## 2. The rule for the world

**Every minute a visitor watches, something should happen that is caused by one of:
(a) distance, (b) local time, (c) real weather, (d) other watchers.** If a minute passes
with none of those, the world is broken.

## 3. The panorama spec (per zone)

| Property | Spec |
|---|---|
| Master size | 3600 × 1200 (3:1). Generate at the largest size the tool allows, upscale if needed. |
| Camera | Eye level at **1.6 m**, standing about **6 m from the subject**, looking along the street. Buildings are cropped by the top of the frame; only the lower part of a dome or tower may be visible. Slight wide angle. No dutch tilt. |
| Ground line | The walkable pavement edge at **78–84 %** of image height, roughly horizontal across the middle 60 % of the width. This is where his feet go. Pavement occupies the lower fifth only. |
| Horizon | ~52–58 % of image height. |
| Scale reference | A doorway on the near plane should be roughly one quarter of image height. (1.78 m person ≈ 0.85 × door.) |
| People | **None.** The rig provides people. |
| Text | **None** legible (AI text is gibberish; real text may be wrong or political). Shop signs blank or abstract. |
| Flags / religious symbols / political posters | None in focus. Distant church/mosque silhouettes as skyline are fine; they are landmarks. |
| Style | One house style across all cities: painterly, warm, slightly desaturated shadows, clean edges — the Tbilisi masters are the reference. Keep it. |
| Tileable | The left 8 % and right 8 % must blend. Generate normally, then run the blend script (P4) — it cross-fades the last 8 % into the first 8 % so the zone can scroll for 2 km without a hard seam. |
| Variants | `day` (required), `night` (required for `landmark`, optional elsewhere — made via img2img from `day` at low denoise so composition stays identical), `golden` (optional; otherwise done by grading). |
| Foreground cutouts | 2–3 per city: a lamp post, a tree, a kiosk, a fountain edge. Generated on a flat magenta background and keyed, or generated normally and cut with any background-removal tool. Placed on the near parallax layer. |

if you can see the whole dome, the camera is too far away.

### Prompt template (paste into whatever generator you use; keep the seed per city)

```
A wide painterly street panorama of {ZONE_DESCRIPTION} in {CITY}, {COUNTRY}, seen at
eye level looking along the pavement, warm afternoon light, {LOCAL_ARCHITECTURE_CUES},
{LOCAL_MATERIALS_AND_COLOURS}, empty pavement in the foreground running left to right
at the lower fifth of the frame, no people, no readable text or signs, no flags, no
vehicles in the foreground, gentle atmospheric depth, clean edges, storybook realism,
consistent with a travel illustration series. Aspect 3:1.
```

Zone descriptions that work (fill per city, one line each, in the pack):

| Zone | Description pattern |
|---|---|
| arrival | "the main boulevard / square at the edge of the centre, wide, a few trees, the city's skyline visible" |
| lanes | "a quiet residential lane, {typical housing}, courtyards, laundry, a cat-sized alley" |
| market | "the covered / open market street, stalls with {local produce}, awnings, crates, hanging goods" |
| café | "a small café terrace / tea house frontage with two empty tables, {local pastry/tea} visible" |
| landmark | "{the defining view}: {landmark} seen from a public viewpoint, late golden light" |

Night prompt (img2img on the day master, denoise 0.35–0.45):
```
Same scene at night, warm lit windows, a few street lamps, deep blue sky, no people.
```

## 4. Per-zone ground truth (the metadata that fixes the floating man)

Each zone in the pack declares a `stage` block. Values are fractions of the panorama
*image* (not the viewport), so they survive any aspect ratio.

```ts
stage: {
  groundLineY: 0.81,        // where feet touch, as a fraction of image height
  horizonY: 0.55,
  personHeightFrac: 0.30,   // how tall a 1.78 m person is, as a fraction of image height, at the ground line
  walkableX: [0.15, 0.85],  // where he may stand (fraction of image width)
  palette: ["#c9a26b", "#6f7a5a", "#2e3a4f"],  // three dominant colours for grading
  lightDir: "left" | "right" | "top",           // where the sun is, for the character key light
  parallax: { far: 0.35, mid: 0.7, near: 1.25 }  // scroll multipliers relative to ground
}
```

**Compositor rule:** the character defines the image scale. Set
`targetCharacterPx = viewportHeight × TARGET_CHARACTER_HEIGHT_FRAC` (0.24 desktop;
0.20 at widths ≤600 px), then set
`imageScale = targetCharacterPx / (personHeightFrac × imageHeight)`. Anchor the panorama
so `groundLineY` lands at exactly 0.86 of the desktop viewport or 0.80 of the mobile
viewport; never vertically centre it. Clamp `imageScale` at 1.6 and report a master that
needs more than 1.6 as needing regeneration at eye level. The calibration overlay keeps
the raw-image ground, horizon and 1.78 m handles and also previews the rendered viewport,
target outline, scale values and clamp warning.

Defaults (`groundLineY 0.82, horizonY 0.55, personHeightFrac 0.28`) are applied to
every existing zone so nothing breaks before calibration.

## 5. Scrolling and parallax (distance-driven)

- The ground/near layer scrolls exactly with distance: `pixels = metres × pxPerMetre`,
  where `pxPerMetre = characterHeightPx / 1.78`.
- Mid layer (the panorama itself) scrolls at `0.7×`, far/sky at `0.35×`.
- The panorama wraps (tileable) so a 2,200 m landmark zone never runs out.
- Zone transitions: cross-dissolve over 60 m of walking, not a cut. The next zone is
  preloaded at 200 m before the boundary (preload groups already exist).

## 6. Time of day (local clock, always on)

| Local hour | Grade | Extras |
|---|---|---|
| 05–07 | cool, low contrast, +blue | mist particles at ground line |
| 07–16 | day master | — |
| 16–19 | golden: +warm, longer shadow on the character | — |
| 19–21 | dusk: blend day→night variant 0→1 | window lights fade in (additive layer, generated or painted) |
| 21–05 | night variant (landmark zone) or night grade (others) | fewer ground-life blobs, lamps on |

Implemented as: CSS-free — a Pixi `ColorMatrixFilter` on the world container with
per-hour keyframes interpolated by the city's local time, plus the night texture
cross-fade where a variant exists. The character canvas receives the same grade values
(exposure, tint) so he changes with the world.

## 7. Real weather (free)

Open-Meteo (`api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,weather_code,wind_speed_10m,is_day`)
needs no key. The server fetches it once per 10 minutes per city, caches it in
`journey_runtime` (or a tiny `city_weather` row), and the bootstrap carries it.

| WMO code | World | Character |
|---|---|---|
| clear / mainly clear | nothing | — |
| overcast (3) | −10 % contrast, cooler tint | — |
| fog (45,48) | fog band at horizon, far layer opacity 0.6 | — |
| drizzle / rain (51–67, 80–82) | rain particles (reuse motes with velocity), wet-ground specular streak under him | umbrella prop (P11), `shiver` no |
| snow (71–77, 85–86) | snow particles, +white ground tint | breath puff (small particle at head) |
| thunderstorm (95–99) | rain + occasional flash (screen alpha pulse) | — |
| wind > 30 km/h | leaf particles faster, awning flutter (sprite wiggle) | hair/jacket unaffected (rigging cost) |

HUD shows `21° ☀` next to the local time. Copy in the status pill when it rains:
`→ Walking in the rain · Rustaveli Avenue`. Real weather is one of the strongest
"it's real" signals available for free; people in that city will check it against their
window.

## 8. Living details (cheap life)

All deterministic from `global_active_seconds` via the existing `deterministicVariant`,
so every viewer sees the same bird at the same moment.

| Element | How | Cost |
|---|---|---|
| Birds | 3-frame sprite, 2–4 crossing the sky every 40–90 s, faster in wind | one 96×32 sheet, shared |
| Leaves / dust / petals | existing motes, per-city colour and count; petals in spring cities, leaves in autumn | 0 |
| Cat | one 4-frame sit/lick loop, appears on a wall in `lanes` for 20 s every ~6 min; pack chooses colour | one sheet |
| Tram / bus | silhouette slides across the far layer in `arrival` every ~4 min (packs opt in) | one PNG per vehicle type |
| Café steam | 2 particles rising from a cup position in `café` | 0 |
| Awning flutter | sine-wiggle on foreground cutouts when windy | 0 |
| Window lights | additive PNG of lit windows, alpha by dusk | 1 PNG per zone with night variant |
| Background walkers | the resident rig, scaled 0.45–0.6, walking the opposite direction on the mid layer, 1–3 at a time, more at local midday, none at 02:00 | reuses GLB (P11) |
| Passer-by wave-back | when the crowd triggers `wave`, one background walker waves too | P11 |

## 9. What the crowd changes in the world

- Pace ≥ 3×: leaves and birds move slightly faster (the world hurries with him).
- Reactions: wave → he waves and one walker waves back; water → he drinks (sponsor
  bottle skin if sold); photo → the scene "flashes" (white 80 ms) and a 16:9 crop of the
  live scene is saved to the day's album (`/day/<n>#photos`), with the sponsor patch in it.
- 100+ watchers for the first time in a day: a small flag bunting sprite appears on the
  `market` zone until rollover. (One PNG. People will notice.)

## 10. Making a city in 2 hours (the pipeline the CLI in P19 automates)

1. `pnpm pack:new <city-slug>` scaffolds `content/countries/<slug>.ts` + `art/<slug>/` from a YAML you fill in: country, city, lat/lon, timezone, five zone descriptions, landmark name, local phrase (script/translit/gloss/pronunciation), resident description, 6 dialogue lines, 8 notebook lines, 2 vote-blurbs, postcard copy.
2. The owner produces 5 day panoramas + 1 night (landmark) + 2 cutouts with the prompt template and drops the PNGs into `art/<slug>/zones/<zone>/master.png`. Codex builds tooling and diagnostics; it does not generate city paintings.
3. `pnpm pack:build <slug>` runs sharp: normalise to 3600×1200, make tileable, derive webp (day, night, window-lights if provided), estimate palette, write default `stage` values.
4. Open `/api/admin/preview/<slug>` → calibrate ground line per zone (1 min each) → save.
5. `pnpm content:validate` → the schema refuses unsafe fields (no free text outside the listed slots) and missing stage values.
6. Review dialogue against `01-PRODUCT.md §7`. Mark `reviewStatus: "creator_reviewed"`.

Keep a buffer of **every neighbour of the two most likely next countries** ready. From
Istanbul that is Bulgaria and Greece; from Sofia it is Serbia, North Macedonia, Romania.
The seven Phase 3 cities already cover most of the Balkan path.

## 11. Delete

- `distant.webp`, `architecture.webp`, `ground-2/3.webp`, prop cutouts and preload
  entries for the v3 branch (after P2 lands, in P18).
- The Phase 3 "one master cropped five ways" shortcut. Every zone gets its own painting.
  The owner replaces Sofia → Prague zones with separate paintings made from the template
  during week 1. Codex does not regenerate those cities.
