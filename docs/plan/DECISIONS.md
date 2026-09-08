# Season 1 decision register

Recorded during P0 on 2026-09-08. Sources: [00-README.md §The five decisions](00-README.md#the-five-decisions-this-plan-makes-so-you-dont-have-to-re-decide-them) and [01-PRODUCT.md §0](01-PRODUCT.md#0-four-decisions-only-you-can-make-decide-before-prompt-4).

## Five decisions established by the plan

These describe the intended product, not features already implemented.

| Decision | Value | Implementation prompts |
|---|---|---|
| Journey promise | Season 1 lasts **30 days**. Visiting 195 countries remains the dream, not a promise of 195 consecutive days. | P9, P12, P16, P21 |
| Collective pace | More watchers make him walk faster: one watcher = 1×, two = 2×, four = 3×, eight = 4×, sixteen or more = 5×. No watchers means no progress. | P4–P5 |
| Daily stakes | Reach the landmark at **8,000 metres**; marathon stretch goal at **42,195 metres**. Completed days retain grey, colour, or gold outcomes. | P4, P13, P16 |
| Destination vote | Vote between neighbouring countries. Candidate exhaustion, fallback destinations, and the Day-1 name vote need the resolutions recorded in ROADMAP.md before P9. | P9, P22 |
| Watching countries | Show, rank, and thank the countries contributing watch time, using server-confirmed aggregates. | P7, P12–P14 |

## Four owner-choice categories

Recommendations below are copied from the plan and are **not owner selections**. The current repository/package name does not establish a final product name or domain. TODO values remain unresolved until the owner supplies them.

| Choice | Selected value | Recommendation from 01-PRODUCT §0 | Needed before |
|---|---|---|---|
| Product name + domain | Product name: **TODO**; domain: **TODO** | Keep Him Walking; `keephimwalking.lol` if available, then `.com`, then `.live`. Availability has not been checked. | P4 planning checkpoint; final copy, share URLs, assets and launch |
| Character naming | Character-name shortlist: **TODO**; final name: unset until naming is resolved | Day-1 name vote; suggested shortlist: Milo, Nur, Sami, Bek. Suggested choice if skipping the vote: Milo. | P4 planning checkpoint; P9 name-vote seed |
| Season length | **30 days** | 30 days; already established by README decision 1, rather than a new inferred owner choice. | P9 scheduling; P21 seed |
| Rollover time | UTC hour: **TODO** | 16:00 UTC | P4 planning checkpoint; P9 rollover, P15 inventory, P21 cron/seed |

`.env.example` contains `ROLLOVER_UTC_HOUR=16` because §04.9 specifies that proposed default. It does not approve a production rollover time. Likewise, `ASSET_BASE_URL=https://assets.<domain>` is a placeholder, not a selected or provisioned domain.

## Authority and unresolved choices

- Preserve Postgres authority, locked security-definer RPCs, pure motion inputs, and a separate 60-second maximum on browser extrapolation.
- Preserve honest state labels and confirmed/extrapolated/last-confirmed number labels.
- Visitor reactions are enums. P20 corrections are the sole visitor free-text exception and remain private. Sponsor creative continues through its separate approval workflow.
- Owner choices and policy conflicts remain recorded as TODO or unresolved; P0 does not silently choose fallback countries, naming policy, paid services, or launch dates.
- See [ROADMAP.md](ROADMAP.md) for code references, missing prerequisites, and the prompt responsible for resolving each issue.
