# Optional future Rive handoff

Status: **deferred enhancement, not a Phase 2 gate**.

The production path currently uses the versioned sprite manifest in the seven schema-v3 country packs. The Rive adapter remains intact so valid `.riv` files can replace the sprite driver later without changing Pixi world ownership, React dialogue/HUD ownership, or the semantic traveler command contract.

No fake or invalid `.riv` files are present. If Rive assets are commissioned later, use the existing `JourneyCharacter` / `JourneyMachine` / `JourneyCharacterVM` contract and validate the same actions, locomotion speed, reduced-motion state, and replaceable sponsor patch before switching any pack to `driver: "rive"`.

The current sprite delivery must pass manifest, state transition, missing-frame, planted-foot, sponsor-patch, fallback, asset-budget, desktop-video and mobile-video gates before it can be described as production-ready.
