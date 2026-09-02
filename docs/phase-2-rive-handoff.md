# Phase 2 production Rive handoff

Status: **external delivery gate open**. The application adapter and manifest contract are implemented, but the production `.riv` binaries have not been delivered and the temporary sprite rig is not relabeled as production.

Required immutable files:

- `public/rive/traveler/v1/traveler.riv`
- `public/rive/npcs/v1/base-a.riv`
- `public/rive/npcs/v1/base-b.riv`

Contract:

- Artboard: `JourneyCharacter`
- State machine: `JourneyMachine`
- View model: `JourneyCharacterVM`
- Properties: `walking` (boolean), `walkingSpeed` (number), `action` (enum), `mood` (enum), `facingRight` (boolean), `reducedMotion` (boolean), `sponsorPatch` (replaceable image)
- Action values: `idle`, `start_walk`, `walk`, `slow_walk`, `stop`, `notice`, `approach`, `greet`, `talk`, `listen`, `react`, `goodbye`
- `rest` and resume are transitions around the action values. Dialogue remains semantic React/HTML.

Delivery evidence still required before the Phase 2 exit gate: source/license, Rive editor and web-runtime versions, manifest contract test, full-motion and reduced-motion recordings, ground contact at all locomotion speeds, secondary clothing/hair/backpack motion, two NPC bases, sponsor-patch replacement, failure fallback, and low/mid-range physical-device results.
