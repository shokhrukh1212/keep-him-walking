Continue the existing viral travel product and implement a substantially better character candidate in the existing preview. Read this entire brief before editing. This is an implementation request, not a request for another plan-only response.

The current candidate at /preview/characters has useful infrastructure and eleven actions, but I reject its visual quality. The traveler still has the wrong face, hair, clothing shapes and posture; I also find the motion robotic. Preserve useful engineering work and correct the actual assets, animation and rendering. Passing tests, using a skinned mesh, or having eleven named clips does not establish likeness or believable acting.

1. Establish the target and preserve product scope

Use public/traveler/temporary/v1/idle.webp as the authoritative traveler reference, after verifying it is the approved landing-page artwork. If it moved, trace the actual landing component to its source. Read the supplied screenshots as additional evidence. If the reference cannot be found, report that specific missing dependency; do not invent another identity.

The target is the illustrated traveler brought to life as a coherent 3D character, with convincing human anatomy and behavior. Preserve the reference's youthful adult appearance, warm expression, expressive eyes and eyebrows, swept wavy dark hair, slender relaxed silhouette, teal open overshirt with rolled sleeves, white T-shirt, tan trousers, sneakers, watch and mustard/yellow backpack. A generic realistic head with matching clothing colors is insufficient. Do not alter the reference to make it resemble a weaker model.

Keep the existing hybrid illustrated scene, fixed/controlled camera, country artwork, structured dialogue, sponsor behavior, journey authority and semantic commands. This repair does not require a new 3D world, roaming controls, backend migration, voice generation or avatar customization. Keep the accepted approximate 100-steps-per-minute cadence as a reference while improving gait quality. Preserve the full encounter sequence: walk, notice, slow/turn, approach, camera focus, greeting, alternating talk/listen/reaction, goodbye, camera restore and walking.

Work on the character preview and its required source assets. Keep the published journey on its existing implementation until I visually accept the replacement. Retain a reversible comparison with the rejected candidate. Do not deploy or switch production as part of this request.

2. Audit the actual implementation before choosing what to replace

Read the repository instructions, package versions, docs/realistic-character-implementation.md, src/components/traveler/CharacterStage3D.tsx, src/lib/characters/actor.ts, the character manifest, public/characters/v1/CREDITS.md, art/characters/v1, and the scripts that build, retarget, bake, optimize and export the models. Resolve moved paths from the repository. Do not rely on the previous completion summary as proof that a feature exists.

Make a concise evidence table with: observed defect, actual cause or unverified hypothesis, responsible source, and proposed correction. Distinguish confirmed code findings from visual inference.

For each of the eleven existing actions, record the actual source file, source animation/take name, author/provider, license, duration, animated bone/morph channels, retargeting method and modifications. A clip named walk or talk could still contain crude scripted rotations. If a clip was procedurally synthesized, label it that way. Do not describe it as motion capture without provenance. If Mixamo was planned but never downloaded, state that plainly.

Inspect rest/bind poses, bone orientation and roll, scale/units, skin weights, cloth geometry, normals, face controls, material maps, mesh simplification and export settings. Check whether runtime code replaces imported textured materials with plain colors, overwrites animated bones, resets actions each frame, applies the clock twice, or uses one deterministic phase identically for both actors.

Compare the same pose and source clip at three stages: Blender source, unoptimized exported GLB in a minimal neutral viewer, and the actual character preview. Keep camera framing and lighting comparable. Also compare optimized versus unoptimized exports. This must identify where quality is lost:

- Weak in Blender: asset or authored motion problem.
- Good in Blender but weak in GLB: investigate unsupported materials, rig constraints, drivers, deformation and export.
- Good in GLB but weak in the app: investigate runtime playback, material overrides, lighting, camera and compositing.
- Good before optimization but weak afterward: repair simplification/compression settings.

Do this comparison using existing inspection controls where possible. Do not build a large diagnostic subsystem. A still frame cannot establish temporal movement quality; inspect live playback.

3. Correct the character asset before expanding its animation work

Assess whether the current editable model can actually be brought to the reference's likeness. Reuse sound geometry and rigs where useful, but do not spend the entire task adjusting shader colors on the wrong face or hairstyle.

Evaluate a professionally authored stylized base as an alternative if needed. Blender Studio Snow is a free candidate to inspect, not an automatically approved substitute for my traveler. Its published character pages identify a CC-BY license requiring credit. Check the downloaded version's terms and compatibility. Test one browser export before investing in customization: this is a Blender animation rig, not a ready-made lightweight GLB. Its face, outfit and silhouette still require adaptation to my reference. Do not replace the Almaty woman's identity with a stock character just because a companion rig is available.

The existing MakeHuman/MPFB base remains usable if you can demonstrably improve its likeness and styling. The source tool being free is not a reason to accept generic anatomy, helmet-like hair or plain slab-like garments.

Target $0 in asset spending. My present budget is $5–$10, superseding the older plan's $20 allowance. Do not purchase a product or start a subscription automatically. If a specific paid item would solve a demonstrated deficiency, provide its exact link, payable price, renewal terms where relevant, usable formats, license, and remaining customization work. Continue useful work that does not depend on purchasing it. Do not present marketplace search snippets as verified asset quality.

Meshy Image-to-3D is an optional experiment only. Its official documentation currently describes a $20/month Pro plan with a 50% first-month discount for eligible new subscribers; verify checkout, taxes and account eligibility before calling it a $10 purchase. Current official help says free users cannot download newly generated models, so do not promise a free export. Public licensing descriptions are not entirely consistent; verify the terms applying to the actual output. An AI-generated textured mesh still needs inspection of fingers, joint topology, facial controls and clothing separation. A pose with hands hidden in pockets is not a suitable sole rigging reference. Use the approved identity, clean separated limbs in an A/T pose and consistent views if this experiment is chosen. Do not silently substitute a different face or treat automatic rigging as final polish.

On the selected model, address these visible problems directly:

- Face: match eye proportions/spacing, brows, cheek and jaw shape, nose, mouth and warm neutral expression. Provide usable eyelids, gaze and subtle expression controls.
- Hair: match the reference's asymmetrical swept waves, silhouette, volume and hairline. Use an efficient authored hair solution appropriate to this art style.
- Clothes: fix the bulky collar and chest shapes. Build a readable overshirt opening, rolled sleeves, seams, restrained fabric folds, fitted trousers and convincing cuffs/shoes. Preserve form at shoulder and knee bends.
- Backpack: fit the bag and straps to the torso with plausible thickness and attachment. Keep the sponsor surface attached and naturally occluded.
- Hands: relaxed resting finger poses and articulated grips appropriate to each object. Preserve anatomical volume through wrist and elbow rotation.
- Posture: a comfortable balanced stance with small asymmetry; no permanent squat, rigidly locked knees or hanging claw-like hands.

Do not force all clothing, hair and accessories into one mesh. Separate properly attached or skinned meshes are acceptable. The visible anatomy and identity must remain coherent.

Finish an in-browser likeness/deformation check with neutral face, modest smile, blink, head turn, raised arm, bent elbow and a full stride. Inspect front, three-quarter, side and back at the actual journey scale and intended close-up scale. Compare with the original reference on screen. Resolve obvious failures here before investing in all other clips. Continue autonomously through the remaining work when the candidate supports it; final visual acceptance remains mine.

4. Prove natural locomotion and correct playback

Use a carefully selected human motion source or well-authored animation as the main performance. Mixamo is a free source of character/body animation with an Adobe ID and permits commercial projects. Mesh2Motion provides CC0 animation assets and editable sources as a fallback; inspect the actual clips because access and clip count do not prove suitability. Do not assume either library contains every required acting beat or a complete facial performance.

Retarget once to the chosen character and correct the result in Blender. Preserve pelvis translation, appropriate hip/torso counter-rotation, shoulder participation, support transfer, heel/sole/toe behavior, swing clearance and restrained arm/wrist motion. Account for the backpack. Do not flatten an otherwise good source performance into a few sine waves. Small procedural gaze or secondary-motion adjustments are acceptable when they improve the authored motion.

Choose one explicit root-motion strategy. In a fixed-camera scene with moving ground, an in-place character can work, but ground displacement must match the clip's calibrated travel and foot contacts. At approximately 100 steps/minute, a full two-step gait cycle is approximately 1.2 seconds, not 0.6 seconds. Determine the actual contact timing from the source clip. Do not force every source to an arbitrary playback duration without checking its motion.

Preserve planted-foot behavior in the shared scene coordinate system. Add contact correction only where necessary, with support-aware timing. Blend or release foot locks on swing phases, starts, stops, turns and interruptions. Do not pin both feet during a step or compensate for poor animation by stretching the legs.

Author or select a believable stop: transfer weight, place the free foot and settle into standing. A generic crossfade from a mid-stride pose is not enough if it produces sliding. Resume walking with a visible weight shift and suitable first step. Include turns that move the feet instead of spinning planted shoes through the floor.

In the runtime, preserve the shared authoritative journey sample. Apply delta time or deterministic sampling exactly once. Prevent repeated clip resets and conflicting bone writers. Give actors independent skeleton instances, mixers and expression state; share immutable resources safely. Blend locomotion phases deliberately and layer only channels that can be combined without fighting each other. Do not use arbitrary time offsets that make dialogue or shared journey timing drift.

Inspect walk, stop, idle, turn and resume at normal speed and quarter speed. Fix these before polishing the full action catalog.

5. Build human attention and interaction for both actors

Use the same traveler and the existing Almaty woman identity throughout. Fit their physical scale in one coordinate system: preserve the existing 1.78 m traveler convention and calibrate the roughly 1.68 m NPC starting point against the approved composition. Both are adults on the same floor; do not achieve height by nonuniformly stretching a rig.

Make attention purposeful: eyes/head notice a person or object before the torso follows; both actors look toward their partner when appropriate. Use gentle limits and transitions so gaze does not snap or twist the neck. Provide blinks, modest brow/mouth changes, breathing and weight shifts with different seeded timing for each actor. Variation should be small and motivated, not random movement on every joint.

Keep speaking, listening, reacting and greeting distinct. Use asymmetrical conversational gestures, pauses, occasional nods and changes in emphasis. Avoid both actors waving, nodding and gesturing in exact synchrony throughout. A reply should visibly respond to the preceding beat while preserving the scene's authoritative timeline.

Preserve text dialogue without adding audio. Use restrained speaking expressions; do not claim lip synchronization without speech audio. Confirm that eyelid, mouth and corrective deformations survive GLB export. A Blender facial controller or driver is not automatically a browser facial animation. Bake required animation to supported bone/morph channels or implement a clearly defined runtime control mapping, then inspect the exported result.

For all existing actions—walk, idle, greet, talk, listen, react, goodbye, drink, phone, photo and rest—provide believable entry, action, recovery and interruption behavior:

- Drink: obtain bottle, grasp its body, lift, bring its opening to the lips during the actual sip interval, tilt naturally, lower and stow. Keep finger and lip contact plausible without making the arm or neck collapse.
- Phone: obtain phone, hold it with a plausible grip, direct gaze toward the screen, make a small interaction and put it away.
- Photo: raise the device, support it with both hands, look toward the correct aiming surface, frame the shot, press the shutter and lower it. Verify the screen/lens orientation for the intended photograph rather than displaying the screen outward by accident.
- Greet/goodbye: coordinated shoulder, elbow, wrist and finger motion with a small body/face response and a relaxed return to rest.
- Rest: support the body's weight convincingly. Any seated action needs an actual seat, a suitable seated pose and correct foot/seat contact.

Use prop-specific grip poses and contact markers. Attach to the appropriate hand/socket, with corrected scale/orientation. For two-handed actions, maintain both contact points using corrected authored motion or targeted IK. Define when objects are retrieved, attached and stowed; avoid pops, teleports and state leakage after interruption or scrubbing. Inspect the full action, not only its midpoint.

6. Match the illustrated scene in the browser

Keep one coherent material language across skin, hair, clothing and props. Verify texture loading, color-space assignments, roughness, normals, tone mapping and exposure against the installed Three.js version. Do not overwrite useful imported materials with plain flat colors. Bake or translate unsupported Blender material features deliberately. Preserve the reference's warm, soft finish while avoiding glossy plastic skin and featureless clothing.

Use soft, directional illumination with enough fill to read the face and a grounded contact shadow. Confirm shadow placement on the same floor used by the animation. Match light direction and perspective to the Almaty artwork. Retain neutral studio mode for diagnosis, then verify the actual scene with Pixi scenery and React UI together. Lighting alone cannot fix the wrong facial geometry or bad acting.

Check source versus GLB deformation, including any Blender skinning features or corrective drivers the browser does not reproduce. Bake or replace incompatible behavior before calling the export correct. Keep editable sources; do not rely on a beautiful offline render that differs from the web asset.

Optimize after establishing visual quality. Preserve the earlier combined-character mobile target of at most 8 MiB where feasible, and report the complete loaded character payload including any externally referenced textures. Measure draw calls, triangles, texture dimensions, approximate GPU resource cost and total-scene frame time. Prioritize face, hands and deformation silhouettes when optimizing. Do not silently meet the download target by degrading the face. If quality and budget conflict, present measured alternatives and the specific tradeoff.

Aim for the existing 30 FPS mobile / 60 FPS desktop targets. Identify the browser, device and test conditions; desktop viewport emulation is not physical-phone performance evidence. Preserve staged loading, reduced motion, context-loss behavior, missing-asset fallback and resource disposal. Generate a matching fallback from the improved canonical model when ready; preserve the approved original as the art reference and do not claim my acceptance of a new landing image.

7. Validate visibly and deliver honestly

Use the existing preview controls and a direct live review. Inspect both actors on desktop and mobile layouts from relevant views, at normal speed first and quarter speed for deformation/contact defects. Check long enough to observe repeating gait and a complete interaction. Preserve any current restrictions on screenshot sheets, videos and long recordings; they are not mandatory deliverables. Do not manufacture evidence you cannot capture or claim a browser review you could not perform.

The visible criteria are:

- The traveler reads as the same recognizable person as the landing reference, including face, hair, proportions and outfit construction.
- Motion has weight, coordinated body action, purposeful attention and relaxed recovery.
- Feet remain grounded appropriately; no obvious skating, persistent crouch or midair standing.
- Joint volume is preserved; no broken limbs, major clothing penetration or visible gaps.
- Both adults have consistent scale and independent, responsive behavior.
- Props stay correctly gripped, oriented and in contact during the relevant phases.
- Action changes, cancellations and scrubbing do not create jumps, stale props or a frozen/wrong face.
- Scene lighting, contact shadows and actual display size support the approved art direction.

Run lint, typecheck, production build and the relevant existing tests. Add only focused regressions for confirmed bugs, such as a clip restarting each frame, lost morph tracks, duplicate time advancement, contact-marker timing or shared actor state. Clip existence and successful rendering are technical checks; they do not certify naturalness.

Deliver the working preview, editable Blender sources, export/build scripts, versioned GLBs and manifest, source/license records and updated implementation notes. Explain the actual causes found, which assets/clips were reused or replaced, what visibly improved, what was measured and what remains uncertain. Keep a concise original-versus-candidate comparison available in the preview.

If an asset-access or art-quality limit prevents the target, identify the concrete missing dependency and provide an actionable acquisition or artist brief: required likeness work, joint-ready topology, facial controls, garment fitting, calibrated rig, example walk/stop and browser GLB proof. Complete useful reversible work first. Do not silently downgrade to crude geometry or claim the visual repair is complete. Do not promise that one more prompt guarantees bespoke character-art quality.

Begin by inspecting the actual sources and the three-stage quality comparison. Then implement the strongest feasible candidate through the sequence above. Final status must clearly distinguish implemented, technically verified, visually inspected by you, and pending my visual acceptance.

Reference links, researched 7 September 2026; verify current terms and installed-version compatibility when using them:

- [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- [Blender Studio Snow v4](https://studio.blender.org/characters/snow/v4/)
- [Blender Studio Snow v3 license and credit](https://studio.blender.org/characters/snow/v3/)
- [MPFB free/core asset licensing](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html)
- [Mesh2Motion sources and licenses](https://github.com/Mesh2Motion/mesh2motion-app)
- [Meshy plan comparison and download restrictions](https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you-free-vs-pro-vs-premium-vs-ultra)
- [Meshy character, face and hand limitations](https://help.meshy.ai/en/articles/16102152-fix-character-pose-face-and-hand-issues-in-meshy)
- [Three.js animation system](https://threejs.org/manual/en/animation-system.html)
- [Three.js color management](https://threejs.org/manual/en/color-management.html)
