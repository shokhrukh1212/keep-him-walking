# Production traveler v2

Generated with the built-in image-generation tool on September 5, 2026, then split and normalized by `scripts/process-traveler-v2.mjs`.

Identity references:

- `public/traveler/temporary/v1/drink.webp`
- `art/phase15/tashkent-v2/traveler-walk-cycle-source.png`
- The generated v2 walk sheet was reused as the identity reference for the transition sheet.

The generation prompts required the same face, curls, body proportions, teal overshirt, white T-shirt, tan cuffed trousers, mustard backpack, watch, and gray sneakers across every pose. The walk prompt requested eight alternating planted-foot poses with natural arm opposition and secondary hair, clothing, and backpack motion. The two action prompts requested the complete idle, encounter, dialogue, photography, phone, drink, rest, stop, goodbye, and resume vocabulary on a common ground baseline. Those action sheets use a flat magenta production key because direct generated transparency introduced a baked checkerboard; the processing script converts that unambiguous key to real alpha without touching the traveler palette.

The source sheets are preserved here. Runtime WebP frames are versioned separately under `public/traveler/production/v2`.
