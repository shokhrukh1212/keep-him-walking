# Prompt 1 cleanup inventory — 13 September 2026

These figures describe three different budgets; they must not be presented as one
number.

| Scope | Measured bytes | Meaning |
|---|---:|---|
| Tracked working tree | 535,626,467 | Source, retained art masters, tests and historical evidence in this checkout |
| `.git` directory | 553 MiB on disk | Current and historical Git objects; no history was rewritten |
| `public/` source tree | 92,337,704 | Local test/fallback source before deployment filtering |
| R2-mirrored public roots | 88,848,842 | `characters`, `scenes`, `audio` and `npcs`, already present on the public asset origin |
| Projected deployed `public/` assets | 3,771,806 | Non-mirrored public files plus the one retained 282,944-byte local scene poster |

`.vercelignore` now keeps `art/`, historical `artifacts/`, old launch evidence and the
R2 mirrors out of the runtime source upload. It deliberately retains those originals in
Git. The deployed app keeps `public/scenes/tashkent/v1/scene-fallback.webp`; a failed CDN
poster retries that same-origin file once, then leaves the CSS sky/ground fallback in
place. The accepted traveler loading frame under `public/traveler/` is also retained.

Credential-free verification checked all 235 painting URLs in all 18 registered packs
at `https://assets.keephimwalking.com` using the Production Origin. Every response was
200 with the expected MIME type, byte length, immutable cache headers where applicable,
and usable CORS. The current/next texture cache and stale-load guards are unchanged;
their existing bounded-residency tests remain the authority for runtime disposal.

Removed from the checkout: 12 tracked Windows `Zone.Identifier` download sidecars, five
new sidecars beside the supplied prompt/assets, and ignored local `test-results/` and
`playwright-report/` output. Historical videos and screenshots were retained because
current test scripts and result documents still cite them. Blender files, art masters,
licenses and credits remain in their source locations.

The repeatable mobile browser measurement is `pnpm assets:browser-report -- <local-url>`.
Record the production-build result in the final completion evidence; a development-server
measurement includes development modules and is not a launch transfer figure.
