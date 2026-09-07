# Phase 3 generated source assets

Generated with the built-in image-generation tool on 2026-09-04, then copied into this repository and processed by `scripts/process-phase3-art.mjs`.

City masters use one shared production brief: a premium hand-painted editorial 2D side-scrolling environment, an eye-level continuous pedestrian route, open lower ground plane, independent distant/middle/foreground depth, and morning-to-evening progression. Prompts prohibited text, logos, flags, watermarks, collage borders, visible seams, repeated buildings and fantasy architecture.

- `sofia/master.png`: Alexander Nevsky, yellow-stone civic streets, Central Market Hall, banitsa café and Vitosha evening.
- `belgrade/master.png`: Republic Square, Dorćol, green market, riverside café and Kalemegdan over the Sava/Danube.
- `zagreb/master.png`: Ban Jelačić Square, Upper Town, Dolac Market, café street and Strossmayer evening.
- `ljubljana/master.png`: Prešeren Square, riverside façades, Central Market, Ljubljanica café and castle blue hour.
- `vienna/master.png`: Ringstrasse, old-city lanes, Naschmarkt, coffeehouse and Belvedere evening.
- `bratislava/master.png`: Michael’s Gate, pastel Old Town, market, Danube café and castle evening.
- `prague/master.png`: Old Town Square, historic lanes, Havelské tržiště, Vltava café and Charles Bridge/castle evening.
- `npc-lineup.png`: seven full-body contemporary local-host concepts ordered Sofia, Belgrade, Zagreb, Ljubljana, Vienna, Bratislava and Prague. The source's baked checkerboard is retained as generation evidence; `scripts/process-phase3-art.mjs` removes only edge-connected neutral pixels, isolates the primary figure and emits real-alpha state assets. These derived states remain private-preview editorial concepts pending qualified local/art review and must not be represented as final character acting.

The exact normalized prompt intent and constraints are also recorded in the country pack source notes and `docs/phase-3-cultural-review.md`. Generated masters remain unpublished editorial-buffer assets.
