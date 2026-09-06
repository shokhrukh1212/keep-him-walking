# Traveler code-only correction

Scope: `phase-3-launch-hardening`, Preview only. No country assets, images,
screenshots, videos, production settings or database data were created/changed.

- Continuous skinned limb surfaces replace disconnected elbow/knee cutouts.
- Corrected support-leg reach, separate hip sockets, upright neutral stance and
  short connected-skeleton transitions replace parked wide-stride action poses.
- Existing head silhouette is no longer cut along its jaw. Original source-art
  identity differences remain; no new identity-matched artwork was authorized.
- Photo, drink, phone, greetings, conversation/listening, reactions and resting
  have independent targets with raise/hold/lower timing. Props follow the grip;
  the bottle has a calibrated reduced size and sip rotation.
- NPC sizing uses the shared actor scale and its actual source aspect ratio.
- The landing-page Preview action dropdown is gated by the same server-only
  Preview/branch check as the demo sponsor. It changes only local presentation;
  authority, presence, contribution and world progress remain untouched. Choose
  Automatic journey to return to live behavior. Purposeful tests repeat after a
  walking interval. OS reduced motion remains honored.

Verification: targeted Vitest tests, lint, typecheck, production build and
`pnpm exec playwright test --config=playwright.traveler-review.config.ts`.
The dedicated browser config explicitly disables screenshots, videos and traces.

Remaining visual limitations: flattened source pixels are not clean layered
artwork; they cannot supply a matching rear view, unseen anatomy, natural finger
poses or newly drawn expressions. The `sit` inspection option is honestly labeled
as crouching/resting because there is no seat layer. Identity and natural movement
remain subject to product-owner live visual review, not an automated approval.
