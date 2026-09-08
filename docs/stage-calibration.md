# Stage calibration — 2026-09-08

Estimates made by inspecting the existing master PNGs under
`art/phase2/tbilisi/zones/<zone>/master.png` and
`art/phase2/tashkent/zones/<zone>-master.png`. Ground means the foreground pavement
where the actor stands; horizon means the approximate perspective convergence line.
These are artistic estimates, not a camera survey. Person height estimates use nearby
ordinary doors (roughly 2.1 m), not monumental archways or distant upper-storey windows.

The served fallback now preserves the whole master, resized proportionally to width
1600. The former double cover crop removed the pavement, so calibration against that
crop could not reliably carry over from the masters. No new artwork was generated.

| City / zone | Master dimensions | Ground fraction | Horizon fraction | Person fraction | Approx. person / door height in master px |
|---|---|---|---|---|---|
| Tbilisi / rustaveli-arrival | 1536×1024 | .84 | .70 | .20 | 205 / 242 |
| Tbilisi / balcony-lanes | 1672×941 | .89 | .66 | .21 | 198 / 233 |
| Tbilisi / dry-bridge | 1537×1023 | .85 | .62 | .23 | 235 / 277 |
| Tbilisi / bakery-courtyard | 1536×1024 | .87 | .60 | .24 | 246 / 290 |
| Tbilisi / abanotubani-evening | 1536×1024 | .88 | .61 | .20 | 205 / 242 |
| Tashkent / arrival-boulevard | 1672×941 | .86 | .73 | .21 | 198 / 233 |
| Tashkent / mahalla-street | 1672×941 | .87 | .66 | .18 | 169 / 200 |
| Tashkent / chorsu-market | 1672×941 | .85 | .64 | .21 | 198 / 233 |
| Tashkent / plov-cafe | 1672×941 | .85 | .60 | .19 | 179 / 211 |
| Tashkent / evening-landmark | 1672×941 | .88 | .64 | .20 | 188 / 222 |

Door heights above are approximate scale comparisons, not annotations of surveyed
objects. Dry Bridge has no dependable foreground door; stall/canopy height and the
adjacent zones provide its scale reference. The bathhouse and monumental squares also
need ordinary human-scale references rather than treating their large arches as doors.
Dry Bridge's walking interval is narrowed to [.35,.75] to avoid its outer market stalls.
Other zones retain [.15,.85]. The three palette colours estimate pavement, foliage and
shadow tones; evening Tashkent uses right lighting, other zones left. These metadata
values are stored in the packs, with parallax defaults retained.

To refine: sign in at `/preview` on a Preview deployment, open
`/api/admin/preview/tbilisi-v1` or `/api/admin/preview/tashkent-v4`, choose a zone, drag
the three handles, and copy stage JSON into that zone's TypeScript definition. Nothing
is saved by the editor. Other packs retain schema defaults and are not calibrated here.

The P2 layout uses width fit with fixed viewport ground fractions. On tall mobile
screens this deliberately exposes sky above the shorter painting. P4's tileable,
distance-driven panorama and distance-based dissolves remain separate work.
