# Brussels Day 2 artwork

The ten ordered places and source filenames are in `places.json`. Runtime files, the
postcard and eleven source images are in Cloudflare R2 under
`scenes/brussels/v1/`; no Brussels image is checked into this repository. The
`r2-assets.json` inventory records the byte length, SHA-256 hash and ground-edge
audit for each of the 96 runtime images. `scenes-v1.build.json` records the build
budget and distinct source hashes.

The images were made with the built-in imagegen tool. The shared prompt for each day
master was: wide 3:1 painterly Brussels travel illustration, early autumn afternoon,
authentic local architecture, camera at pedestrian eye level, walkable pavement in
the lower fifth and an open centre foreground for the separate 3D traveler; no
people, readable text, flags, logos, watermarks or foreground vehicles. The ten
subjects were Bruxelles-Central, Galeries Royales Saint-Hubert, Grand-Place, Place
Sainte-Catherine, the Marolles, Grand Sablon, Mont des Arts, Brussels Park, Parc du
Cinquantenaire and the Atomium. The Atomium night image was edited from its day
master by changing only the light and sky to blue hour, with restrained lamps.

To rebuild, first download the eleven source PNGs from
`https://assets.keephimwalking.com/scenes/brussels/v1/sources/<place>/master.png`
(and `sources/brussels-atomium/night.png`) to the paths in `places.json`; then run
`pnpm scenes:build brussels`. Upload the new renditions and postcard, verify them
against R2, update `r2-assets.json`, and remove the downloaded source and generated
runtime files from the workspace. A future repaint needs a new pack version because
the current day pins `brussels-v1`.

Place references were checked against [Visit Brussels' Royal Quarter guide](https://www.visit.brussels/en/visitors/plan-your-trip/the-royal-quarter),
[Brussels history walk](https://www.visit.brussels/en/visitors/plan-your-trip/a-legendary-stay-for-history-buffs/day-2-splendours-of-brussels),
and [Saint-Hubert Galleries guide](https://www.visit.brussels/en/visitors/what-to-do/galleries-and-passages-treasures-of-brussels-architectural-heritage).
The generated paintings are illustrative interpretations, and the pack's visual and
cultural review status remains pending until the owner accepts it.
