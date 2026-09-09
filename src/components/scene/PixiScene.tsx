"use client";

import { useEffect, useRef, type RefObject } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { Texture as PixiTexture } from "pixi.js";
import type { CountryPack, RouteProp, RouteZone } from "@/lib/content/schema";
import { travelerMotionAt, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import { stageLayout, blendStageLayout, type StageFrame, type StageLayout } from "@/lib/world/stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "@/lib/world/stage-targets";
import type { TravelerCommand } from "@/lib/traveler/types";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { deterministicVariant, routePositionAt } from "@/lib/world/route-clock";
import { segmentVariant } from "@/lib/world/segment-sequencer";
import { composedSegmentSignature } from "@/lib/world/segment-sequencer";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";
import { contactShadowLayout, gradeMatrix, type CharacterContacts, type VisualGrade } from "@/lib/world/visual-grade";
import type { ScheduledActionView } from "@/lib/contracts";
import type { JourneyWeather } from "@/lib/weather/open-meteo";
import { weatherEffect } from "@/lib/weather/effects";
import { combineGrade, gradeForHour, localHourFraction, nightMix } from "@/lib/world/time-grade";
import type { CanvasCapture } from "@/components/traveler/ProductCharacterStage3D";

const EMPTY_SCHEDULED_ACTIONS: readonly ScheduledActionView[] = [];

type Props = {
  pack: CountryPack;
  contacts: RefObject<CharacterContacts>;
  grade: RefObject<VisualGrade>;
  onStageFrame: (frame: StageFrame, source: "static" | "pixi") => void;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  scheduledActions?: readonly ScheduledActionView[];
  weather?: JourneyWeather | null;
  onCaptureReady?: (capture: CanvasCapture | null) => void;
  command: WorldCommand;
  reducedMotion: boolean;
  qualityTier: QualityTier;
  travelerCommand?: TravelerCommand;
  onMotionSample?: (frame: {assetVersion:string;motion:TravelerMotionSnapshot}) => void;
  onZoneChange: (zoneId: string, zoneLabel: string) => void;
  onDiagnostics: (snapshot: WorldDiagnosticsSnapshot) => void;
  onReady: () => void;
  onFailure: () => void;
};

type RuntimeRefs = Pick<Props, "routeSeconds" | "routeRuntime" | "command" | "reducedMotion" | "travelerCommand">
  & { scheduledActions: readonly ScheduledActionView[]; weather: JourneyWeather | null };

export function PixiScene({
  pack,
  contacts,
  grade: gradeRef,
  onStageFrame,
  routeSeconds,
  routeRuntime,
  scheduledActions = EMPTY_SCHEDULED_ACTIONS,
  weather = null,
  onCaptureReady,
  command,
  reducedMotion,
  qualityTier,
  travelerCommand,
  onMotionSample,
  onZoneChange,
  onDiagnostics,
  onReady,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<RuntimeRefs>({ routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, weather });
  const motionCallback = useRef(onMotionSample);
  const zoneCallback = useRef(onZoneChange);
  const diagnosticsCallback = useRef(onDiagnostics);

  useEffect(() => {
    runtime.current = { routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, weather };
    motionCallback.current=onMotionSample;
    zoneCallback.current = onZoneChange;
    diagnosticsCallback.current = onDiagnostics;
  }, [command, onDiagnostics, onZoneChange, reducedMotion, routeRuntime, routeSeconds, scheduledActions, travelerCommand, weather, onMotionSample]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined;

    async function mount() {
      const element = host.current;
      if (!element) return;
      try {
        const { Application, Assets, Container, Graphics, Sprite, Texture, ColorMatrixFilter } = await import("pixi.js");
        if (disposed) return;
        const limits = QUALITY_LIMITS[qualityTier];
        const app = new Application();
        await app.init({
          resizeTo: element,
          backgroundAlpha: 0,
          antialias: qualityTier !== "low",
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, limits.resolution),
          preference: "webgl",
          powerPreference: "high-performance",
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        cleanup = () => { app.destroy(true, { children: true }); return undefined; };
        app.ticker.maxFPS = limits.targetFps;
        app.canvas.setAttribute("aria-hidden", "true");
        element.appendChild(app.canvas);

        const camera = new Container();
        const sky = new Graphics();
        const layerRoot = new Container();
        const transitionRoot = new Container();
        const propRoot = new Container();
        const groundLifeRoot = new Container();
        const groundDetailsRoot = new Container();
        const weatherRoot = new Container();
        // Precipitation, the horizon fog band and the storm flash all live here.
        const fogBand = new Graphics();
        const stormFlash = new Graphics();
        let precipitation: InstanceType<typeof Graphics>[] = [];
        let precipitationKind: "none" | "rain" | "snow" = "none";
        // Pixi owns the grade; P10 will animate this same object in the world loop.
        gradeRef.current = { exposure: 1, tint: { r: 1, g: 1, b: 1 } };
        const worldGrade = new ColorMatrixFilter();
        camera.filters = [worldGrade];
        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = shadowCanvas.height = 128;
        const context = shadowCanvas.getContext("2d");
        if (!context) throw new Error("Contact shadow canvas unavailable");
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(0.35, "rgba(0,0,0,0.65)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        const shadowTexture = Texture.from(shadowCanvas);
        shadowTexture.label = "character-contact-shadow";
        const shadows = { traveler: new Sprite(shadowTexture), resident: new Sprite(shadowTexture) };
        for (const shadow of Object.values(shadows)) { shadow.anchor.set(0.5); shadow.visible = false; }
        groundLifeRoot.addChild(groundDetailsRoot, shadows.traveler, shadows.resident);
        // Draw order, back to front: sky, the panorama (or the legacy parallax
        // layers), props, ground life, weather. Nothing composites over the
        // painting itself.
        camera.addChild(sky, layerRoot, transitionRoot, propRoot, groundLifeRoot, weatherRoot);
        weatherRoot.addChild(fogBand);
        app.stage.addChild(stormFlash);
        app.stage.addChild(camera);
        const clock = new PresentationClock();

        // V3 country packs include a complete editorial fallback for every
        // zone. Use that coherent painting as the panorama instead of stacking
        // opaque horizontal crops, which exposed hard seams as their parallax
        // offsets diverged. Motion remains explicit through panorama travel,
        // the independently moving ground-life track and weather.
        const coherentPanorama = pack.schemaVersion === 3;

        type LayerPool = {
          parallaxScale: number;
          y: number;
          height: number;
          layerIndex: number;
          sequenceLayerIndex: number;
          textures: PixiTexture[];
          sprites: InstanceType<typeof Sprite>[];
          panorama: boolean;
        };
        type PropPool = {
          definition: RouteProp;
          display: InstanceType<typeof Graphics> | InstanceType<typeof Sprite>;
          illustrated: boolean;
          nativeHeight: number;
          slot: number;
        };
        let pools: LayerPool[] = [];
        let props: PropPool[] = [];
        let groundLife: InstanceType<typeof Graphics>[] = [];
        let motes: InstanceType<typeof Graphics>[] = [];
        let activeZone: RouteZone | null = null;
        let activeZoneIndex = -1;
        let pendingZoneIndex = -1;
        let buildGeneration = 0;
        let transitionGeneration = 0;
        let transitionPendingIndex = -1;
        let transition: {
          zoneIndex: number;
          zone: RouteZone;
          texture: PixiTexture;
          sprites: InstanceType<typeof Sprite>[];
        } | null = null;
        let ready = false;
        let estimatedTextureBytes = 0;
        let zoneFade = 1;
        let imageW = 1600, imageH = 900;
        let displayedLayout: StageLayout | null = null;
        let previousLayout: StageLayout | null = null;
        let layoutChangedAt = 0;
        let lastWidth = 0, lastHeight = 0;

        const zoneAssetUrls = (zone: RouteZone) => [
          ...(coherentPanorama
            ? [zone.fallbackUrl]
            : zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url))),
          ...(!coherentPanorama
            ? zone.props.flatMap((prop) => prop.assetUrl ? [prop.assetUrl] : [])
            : []),
        ].map(publicAssetUrl);

        const drawProp = (graphic: InstanceType<typeof Graphics>, definition: RouteProp) => {
          const [primary = "#315d4d", secondary = "#d9a75a"] = definition.colors;
          graphic.clear();
          if (definition.kind === "tree") {
            graphic.rect(-7, -72, 14, 72).fill(primary);
            graphic.circle(0, -96, 40).fill(secondary);
            graphic.circle(-24, -80, 26).fill(secondary);
            graphic.circle(25, -78, 29).fill(secondary);
          } else if (definition.kind === "lamp" || definition.kind === "signpost") {
            graphic.rect(-4, -92, 8, 92).fill(primary);
            graphic.roundRect(-17, -111, 34, 25, 8).fill(secondary);
          } else if (definition.kind === "bench") {
            graphic.roundRect(-42, -34, 84, 14, 5).fill(primary);
            graphic.rect(-34, -20, 7, 20).fill(secondary);
            graphic.rect(27, -20, 7, 20).fill(secondary);
          } else if (definition.kind === "awning") {
            graphic.poly([-50, -62, 50, -62, 38, -36, -38, -36]).fill(primary);
            graphic.rect(-40, -36, 5, 36).fill(secondary);
            graphic.rect(35, -36, 5, 36).fill(secondary);
          } else if (definition.kind === "stall") {
            graphic.rect(-48, -52, 96, 52).fill(primary);
            graphic.poly([-56, -54, 56, -54, 42, -80, -42, -80]).fill(secondary);
          } else {
            graphic.roundRect(-34, -27, 68, 27, 8).fill(primary);
            graphic.circle(-17, -35, 17).fill(secondary);
            graphic.circle(15, -38, 20).fill(secondary);
          }
          graphic.alpha = 0.84;
        };

        const prepareTransition = async (zoneIndex: number) => {
          if (!coherentPanorama || transition?.zoneIndex === zoneIndex
            || transitionPendingIndex === zoneIndex) return;
          transitionPendingIndex = zoneIndex;
          const generation = ++transitionGeneration;
          const zone = pack.route.zones[zoneIndex];
          let texture: PixiTexture;
          try {
            texture = await Assets.load<PixiTexture>(publicAssetUrl(zone.fallbackUrl));
          } catch (error) {
            if (generation === transitionGeneration) transitionPendingIndex = -1;
            throw error;
          }
          if (disposed || generation !== transitionGeneration) return;
          transitionRoot.removeChildren().forEach((child) => child.destroy());
          const sprites = Array.from({ length: 6 }, () => {
            const sprite = new Sprite(texture);
            transitionRoot.addChild(sprite);
            return sprite;
          });
          transition = { zoneIndex, zone, texture, sprites };
          transitionPendingIndex = -1;
          transitionRoot.alpha = 0;
        };

        const buildZone = async (zoneIndex: number) => {
          pendingZoneIndex = zoneIndex;
          const generation = ++buildGeneration;
          const zone = pack.route.zones[zoneIndex];
          const panoramaTexture = await Assets.load<PixiTexture>(publicAssetUrl(zone.fallbackUrl));
          const loaded = coherentPanorama
            ? [{
              layer: { id: "coherent-panorama", speed: 0.055, y: 0, height: 1, segments: [] },
              textures: [panoramaTexture],
            }]
            : await Promise.all(
              zone.layers.map(async (layer) => ({
                layer,
                textures: await Promise.all(
                  layer.segments.map((segment) => Assets.load<PixiTexture>(publicAssetUrl(segment.url))),
                ),
              })),
            );
          const propTextures = await Promise.all(
            coherentPanorama
              ? []
              : zone.props.map((prop) => prop.assetUrl
                ? Assets.load<PixiTexture>(publicAssetUrl(prop.assetUrl))
                : Promise.resolve(null)),
          );
          if (disposed || generation !== buildGeneration) return;

          imageW = panoramaTexture.width;
          imageH = panoramaTexture.height;
          previousLayout = displayedLayout;
          layoutChangedAt = performance.now();

          layerRoot.removeChildren().forEach((child) => child.destroy());
          transitionGeneration += 1;
          transitionPendingIndex = -1;
          transition = null;
          transitionRoot.removeChildren().forEach((child) => child.destroy());
          propRoot.removeChildren().forEach((child) => child.destroy());
          groundDetailsRoot.removeChildren().forEach((child) => child.destroy());
          weatherRoot.removeChildren().forEach((child) => child.destroy());
          let sequenceLayerIndex = 0;
          pools = loaded.map(({ layer, textures }, layerIndex) => {
            const container = new Container();
            layerRoot.addChild(container);
            const sprites = Array.from({ length: 6 }, () => {
              const sprite = new Sprite(textures[0]);
              container.addChild(sprite);
              return sprite;
            });
            const pool = {
              parallaxScale: coherentPanorama
                ? 0.7
                : layer.id === "distant"
                  ? 0.35
                  : layer.id === "architecture"
                    ? 0.7
                    : 1,
              y: layer.y,
              height: layer.height,
              layerIndex,
              sequenceLayerIndex,
              textures,
              sprites,
              panorama: coherentPanorama,
            };
            if (textures.length > 1) sequenceLayerIndex += 1;
            return pool;
          });
          estimatedTextureBytes = loaded.reduce(
            (total, item) => total + item.textures.reduce(
              (layerTotal, texture) => layerTotal + texture.width * texture.height * 4,
              0,
            ),
            0,
          ) + propTextures.reduce(
            (total, texture) => total + (texture ? texture.width * texture.height * 4 : 0),
            0,
          );

          props = coherentPanorama ? [] : Array.from({ length: limits.maxProps }, (_, slot) => {
            const definition = zone.props[slot % zone.props.length];
            const texture = propTextures[slot % zone.props.length];
            if (texture) {
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5, 1);
              propRoot.addChild(sprite);
              return { definition, display: sprite, illustrated: true, nativeHeight: texture.height, slot };
            }
            const graphic = new Graphics();
            drawProp(graphic, definition);
            propRoot.addChild(graphic);
            return { definition, display: graphic, illustrated: false, nativeHeight: 1, slot };
          });
          groundLife = Array.from({ length: qualityTier === "low" ? 7 : 12 }, (_, index) => {
            const detail = new Graphics();
            const color = index % 3 === 0 ? zone.lighting.skyBottom : zone.lighting.grade;
            if (index % 2 === 0) {
              detail.ellipse(0, 0, 18 + (index % 4) * 6, 3 + (index % 3)).fill({ color, alpha: 0.13 });
            } else {
              detail.roundRect(-12, -2, 24 + (index % 5) * 5, 4, 2).fill({ color, alpha: 0.12 });
            }
            groundDetailsRoot.addChild(detail);
            return detail;
          });
          motes = Array.from({ length: limits.motes }, (_, index) => {
            const mote = new Graphics();
            mote.circle(0, 0, 1 + (index % 3) * 0.7).fill({ color: 0xffe4a1, alpha: 0.3 });
            weatherRoot.addChild(mote);
            return mote;
          });
          // Rain and snow are a real signal, not decoration, so even the low
          // tier gets enough particles to read as weather.
          const precipitationCount = qualityTier === "high" ? 42 : qualityTier === "medium" ? 28 : 14;
          precipitation = Array.from({ length: precipitationCount }, () => {
            const drop = new Graphics();
            drop.visible = false;
            weatherRoot.addChild(drop);
            return drop;
          });
          precipitationKind = "none";
          activeZone = zone;
          activeZoneIndex = zoneIndex;
          pendingZoneIndex = -1;
          zoneFade = 1;
          sky.clear().rect(0, 0, app.screen.width, app.screen.height).fill(zone.lighting.skyTop);
          layerRoot.alpha = zoneFade;
          propRoot.alpha = zoneFade;
          groundDetailsRoot.alpha = zoneFade;
          zoneCallback.current(zone.id, zone.label);
          const nextZone = pack.route.zones[(zoneIndex + 1) % pack.route.zones.length];
          void Assets.backgroundLoad(zoneAssetUrls(nextZone)).catch(() => undefined);
          if (!ready) {
            ready = true;
            onReady();
          }
        };

        const resize = () => {
          sky.clear();
          if (activeZone) {
            sky.rect(0, 0, app.screen.width, app.screen.height).fill(activeZone.lighting.skyTop);
          }
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        cleanup = () => {
          observer.disconnect();
          app.destroy(true, { children: true });
          shadowTexture.destroy(true);
          worldGrade.destroy();
          return undefined;
        };

        let displayedSeconds = runtime.current.routeSeconds;
        let displayedDistance = runtime.current.routeRuntime.globalDistanceMetres;
        let elapsed = 0;
        let lastTickAt = performance.now();
        let lastDiagnosticAt = 0;
        let lastMotionAt=0;
        const frameSamples: number[] = [];
        // Pixi's extract re-renders into a texture, so it returns a correct
        // frame whether or not the drawing buffer was preserved.
        onCaptureReady?.(async () => {
          try {
            return app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
          } catch {
            return null;
          }
        });
        app.ticker.add(() => {
          if (document.hidden) return;
          const state = runtime.current;
          // The city's own clock drives the grade; the server's reading drives
          // the sky. Both are shared with the character through gradeRef.
          const localHour = localHourFraction(new Date(), pack.timeZone);
          const effect = weatherEffect(
            state.weather?.code ?? 0,
            state.weather?.windKmh ?? 0,
          );
          gradeRef.current = combineGrade(gradeForHour(localHour), effect.contrastScale);
          worldGrade.matrix = gradeMatrix(gradeRef.current);
          element.dataset.grade = JSON.stringify(gradeRef.current);
          element.dataset.localHour = localHour.toFixed(3);
          element.dataset.nightMix = nightMix(localHour).toFixed(3);
          element.dataset.weatherKind = effect.precipitation;
          const tickAt = performance.now();
          const wallDeltaMs = Math.min(500, Math.max(0, tickAt - lastTickAt));
          lastTickAt = tickAt;
          elapsed += wallDeltaMs;
          frameSamples.push(wallDeltaMs);
          if (frameSamples.length > 180) frameSamples.shift();
          clock.accept(state.routeRuntime, state.travelerCommand?.presenceTtlMs ?? 50_000, tickAt);
          const sample = clock.sample(tickAt);
          const motion = travelerMotionAt(pack, sample.rawSeconds, sample.distanceMetres, state.scheduledActions);
          if(tickAt-lastMotionAt>=100) {lastMotionAt=tickAt;motionCallback.current?.({assetVersion:pack.assetVersion,motion});}
          displayedSeconds = sample.rawSeconds;
          displayedDistance = sample.distanceMetres;

          const position = routePositionAt(pack, displayedDistance);
          const zoneDistance = position.metresIntoZone;
          if (position.zoneIndex !== activeZoneIndex && position.zoneIndex !== pendingZoneIndex) {
            void buildZone(position.zoneIndex).catch((error: unknown) => {
              pendingZoneIndex = -1;
              if (process.env.NODE_ENV !== "production") {
                console.error("World zone load failed", error);
              }
              onFailure();
            });
          }
          if (!activeZone) return;

          let transitionAlpha = 0;
          if (coherentPanorama && position.phase === "route") {
            if (position.zoneIndex === activeZoneIndex && activeZoneIndex < pack.route.zones.length - 1) {
              const remaining = Math.max(0, activeZone.lengthMetres - position.metresIntoZone);
              if (remaining <= 200) void prepareTransition(activeZoneIndex + 1).catch(() => undefined);
              if (remaining <= 60 && transition?.zoneIndex === activeZoneIndex + 1) {
                transitionAlpha = 1 - remaining / 60;
              }
            } else if (transition?.zoneIndex === position.zoneIndex) {
              // Keep the fully blended next painting visible while its ordinary
              // zone build completes at the exact metre boundary.
              transitionAlpha = 1;
            }
          }

          const width = app.screen.width;
          const height = app.screen.height;
          const targetLayout = stageLayout(
            width, height, imageW, imageH, activeZone.stage, CHARACTER_HEIGHT_TARGETS,
          );
          // Resizing immediately reanchors both canvases; zone switches ease for 400 ms.
          if (width !== lastWidth || height !== lastHeight) previousLayout = null;
          lastWidth = width; lastHeight = height;
          const layout = previousLayout
            ? blendStageLayout(previousLayout, targetLayout, tickAt - layoutChangedAt) : targetLayout;
          displayedLayout = layout;
          onStageFrame({ assetVersion: pack.assetVersion, zoneId: activeZone.id,
            viewportW: width, viewportH: height, imageW, imageH, stage: activeZone.stage, layout }, "pixi");
          const groundPixels=displayedDistance*layout.pxPerMetre;
          element.dataset.groundY = String(layout.groundY);
          element.dataset.personHeight = String(layout.personHeightPx);
          element.dataset.characterImageScale = String(layout.characterImageScale);
          element.dataset.zoneId = activeZone.id;
          sky.clear().rect(0, 0, width, height).fill(activeZone.lighting.skyTop);
          // Width-fit can leave space below the image too: extend only the pavement colour.
          sky.rect(0, layout.groundY, width, height - layout.groundY).fill(activeZone.stage.palette[0]);
          element.dataset.gaitPhase=String(motion.cyclePhase);
          element.dataset.characterState=sample.traveling ? motion.action?.state ?? "walk" : "idle";
          element.dataset.actionReview=String(Boolean(state.travelerCommand?.actionReview&&state.travelerCommand.actionReview.action!=="auto"));
          element.dataset.groundPixels=String(groundPixels);
          camera.pivot.set(width / 2, height / 2);
          camera.position.set(width / 2, height / 2);
          camera.scale.set(1);
          layerRoot.alpha = zoneFade * (1 - transitionAlpha);
          transitionRoot.alpha = transitionAlpha;
          propRoot.alpha = zoneFade * (1 - transitionAlpha) * (0.72 + state.command.backgroundLife * 0.28);
          groundDetailsRoot.alpha = zoneFade * (1 - transitionAlpha) * (0.75 + state.command.backgroundLife * 0.25);
          weatherRoot.alpha = 0.5 + state.command.backgroundLife * 0.5;
          element.dataset.zoneTransition = String(transitionAlpha);
          for (const pool of pools) {
            if (pool.panorama) {
              const texture = pool.textures[0];
              const span = Math.max(1, texture.width * layout.imageScale);
              const cameraPixels = state.reducedMotion
                ? 0
                : position.metresIntoZone * layout.pxPerMetre * 0.7;
              const wrapped = ((cameraPixels % span) + span) % span;
              element.dataset.panoramaOffset = String(wrapped);
              element.dataset.panoramaSpan = String(span);
              const first = layout.imageX - wrapped - span;
              for (let slot = 0; slot < pool.sprites.length; slot += 1) {
                const sprite = pool.sprites[slot];
                sprite.texture = texture;
                sprite.scale.set(layout.imageScale);
                sprite.x = first + slot * span;
                sprite.y = layout.imageY;
                sprite.visible = sprite.x + span > -4 && sprite.x < width + 4;
              }
              continue;
            }
            const targetHeight = height * pool.height;
            const sampleTexture = pool.textures[0];
            const scale = targetHeight / Math.max(1, sampleTexture.height);
            const segmentWidth = Math.max(180, sampleTexture.width * scale);
            const cameraPixels = state.reducedMotion
              ? 0
              : zoneDistance * layout.pxPerMetre * pool.parallaxScale;
            const firstIndex = Math.floor(cameraPixels / segmentWidth) - 1;
            for (let slot = 0; slot < pool.sprites.length; slot += 1) {
              const segmentIndex = firstIndex + slot;
              const sprite = pool.sprites[slot];
              const variant = segmentVariant(
                activeZone.id,
                segmentIndex,
                pool.sequenceLayerIndex,
                pool.textures.length,
              );
              sprite.texture = pool.textures[variant];
              sprite.scale.set(scale);
              sprite.x = segmentIndex * segmentWidth - cameraPixels;
              sprite.y = height * pool.y;
              sprite.visible = sprite.x + segmentWidth > -4 && sprite.x < width + 4;
            }
          }

          if (transition) {
            const nextLayout = stageLayout(
              width,
              height,
              transition.texture.width,
              transition.texture.height,
              transition.zone.stage,
              CHARACTER_HEIGHT_TARGETS,
            );
            const span = Math.max(1, transition.texture.width * nextLayout.imageScale);
            const first = nextLayout.imageX - span;
            for (let slot = 0; slot < transition.sprites.length; slot += 1) {
              const sprite = transition.sprites[slot];
              sprite.scale.set(nextLayout.imageScale);
              sprite.x = first + slot * span;
              sprite.y = nextLayout.imageY;
              sprite.visible = transitionAlpha > 0
                && sprite.x + span > -4
                && sprite.x < width + 4;
            }
          }

          const groundCamera = state.reducedMotion ? 0 : groundPixels;
          groundLifeRoot.x = -groundCamera;
          for (const kind of ["traveler", "resident"] as const) {
            const contact = contacts.current[kind];
            const shadow = shadows[kind];
            shadow.visible = Boolean(contact);
            if (!contact) continue;
            const placement = contactShadowLayout(contact, groundCamera);
            shadow.position.set(placement.x, placement.y);
            shadow.width = placement.radiusX * 2;
            shadow.height = placement.radiusY * 2;
            shadow.alpha = placement.alpha;
            if (kind === "traveler") {
              element.dataset.shadowX = String(shadow.x + groundLifeRoot.x);
              element.dataset.shadowY = String(shadow.y);
              element.dataset.shadowRadiusX = String(placement.radiusX);
            }
          }
          element.dataset.shadowVisible = String(shadows.traveler.visible);
          const groundSpacing = width < 500 ? 170 : 240;
          const firstGround = Math.floor(groundCamera / groundSpacing) - 2;
          for (let index = 0; index < groundLife.length; index += 1) {
            const detail = groundLife[index];
            const streamIndex = firstGround + index;
            const jitter = deterministicVariant(`${activeZone.id}:ground-life`, streamIndex, 95);
            detail.x = streamIndex * groundSpacing + jitter;
            detail.y = layout.groundY + layout.personHeightPx * (0.03 + (index % 3) * 0.06);
            detail.scale.set((0.75 + (index % 4) * 0.12) * height / 900);
            detail.visible = detail.x - groundCamera > -100 && detail.x - groundCamera < width + 100;
          }

          const propSpacing = width < 500 ? 390 : 470;
          for (const item of props) {
            const depthSpeed = 0.42 + Math.min(1.2, item.definition.depth) * 0.48;
              const propCamera = state.reducedMotion ? 0 : zoneDistance * depthSpeed * (width / 1_600);
            const firstProp = Math.floor(propCamera / propSpacing) - 2;
            const index = firstProp + item.slot;
            const jitter = deterministicVariant(
              `${activeZone.id}:${item.definition.id}`,
              index,
              180,
            );
            item.display.x = index * propSpacing + jitter - propCamera;
            item.display.y = height * (0.79 + (item.definition.depth - 0.65) * 0.12);
            if (item.illustrated) {
              const targetRatio = item.definition.kind === "tree"
                ? 0.34
                : item.definition.kind === "lamp"
                  ? 0.27
                  : item.definition.kind === "awning" || item.definition.kind === "stall"
                    ? 0.24
                    : 0.16;
              const scale = height * targetRatio * item.definition.depth / Math.max(1, item.nativeHeight);
              item.display.scale.set(scale);
            } else {
              item.display.scale.set(
                Math.max(0.68, Math.min(1.25, item.definition.depth)) * height / 850,
              );
            }
            item.display.visible = item.display.x > -180 && item.display.x < width + 180;
          }

          for (let index = 0; index < motes.length; index += 1) {
            const mote = motes[index];
            // Wind carries the drifting motes faster, as it does the leaves.
            mote.x = ((index * 173 + elapsed * (0.006 + (index % 4) * 0.002) * effect.windScale)
              % (width + 80)) - 40;
            mote.y =
              70 +
              ((index * 97 + Math.sin(elapsed * 0.0007 + index) * 18) %
                Math.max(100, height * 0.62));
          }

          // Redraw only when the sky itself changes, not every frame.
          if (precipitationKind !== effect.precipitation) {
            precipitationKind = effect.precipitation;
            for (const drop of precipitation) {
              drop.clear();
              if (precipitationKind === "rain") {
                drop.rect(0, 0, 1.2, 9).fill({ color: 0xcfe4f2, alpha: 0.5 });
              } else if (precipitationKind === "snow") {
                drop.circle(0, 0, 1.6).fill({ color: 0xffffff, alpha: 0.72 });
              }
              drop.visible = precipitationKind !== "none";
            }
          }

          if (precipitationKind !== "none") {
            const fallSpeed = precipitationKind === "rain" ? 0.62 : 0.11;
            const drift = precipitationKind === "rain" ? 0.05 : 0.03;
            for (let index = 0; index < precipitation.length; index += 1) {
              const drop = precipitation[index]!;
              const lane = index * 149;
              drop.y = ((lane + elapsed * fallSpeed * effect.windScale) % (height + 60)) - 30;
              drop.x = ((lane * 3 + elapsed * drift * effect.windScale
                + Math.sin(elapsed * 0.0012 + index) * (precipitationKind === "snow" ? 22 : 4))
                % (width + 60)) - 30;
            }
          }
          element.dataset.weatherParticles = String(
            precipitationKind === "none" ? 0 : precipitation.length,
          );

          // A fog band sits on the horizon line the zone declares.
          fogBand.clear();
          if (effect.fog) {
            const horizon = height * (activeZone?.stage.horizonY ?? 0.55);
            fogBand
              .rect(0, horizon - height * 0.06, width, height * 0.18)
              .fill({ color: 0xdfe7ea, alpha: 0.34 });
          }

          // One shared 80 ms flash, derived from the authoritative second so
          // every viewer sees the same lightning. Never under reduced motion.
          stormFlash.clear();
          if (effect.flash && !state.reducedMotion) {
            const phase = displayedSeconds % 23;
            if (phase < 0.08) {
              stormFlash.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 0.5 });
            }
          }
          if (elapsed - lastDiagnosticAt >= 1_000 && frameSamples.length > 0) {
            lastDiagnosticAt = elapsed;
            const sorted = [...frameSamples].sort((a, b) => a - b);
            const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
            const average = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
            const groundPool = coherentPanorama ? undefined : pools[pools.length - 1];
            const groundHeight = groundPool ? height * groundPool.height : height * 0.24;
            const groundTexture = groundPool?.textures[0];
            const groundWidth = groundTexture
              ? groundTexture.width * (groundHeight / Math.max(1, groundTexture.height))
              : width;
            const segmentIndex = Math.floor((displayedDistance * (width / 1_600)) / Math.max(1, groundWidth));
            const visibleObjects = pools.flatMap((pool) => pool.sprites).filter((sprite) => sprite.visible).length
              + props.filter((item) => item.display.visible).length
              + groundLife.filter((item) => item.visible).length
              + motes.length + Object.values(shadows).filter((shadow) => shadow.visible).length;
            // Test-observable inventory of every texture the world holds on the
            // stage. Assets.load stamps the resolved URL onto the texture label;
            // textures built in the browser (a canvas, a render target) have no
            // URL, so they are recorded by size instead. A regression that
            // reintroduces a retired layer then fails in Playwright rather than
            // only in visual review.
            const drawnTextures = new Set<string>();
            const collectTextures = (node: InstanceType<typeof Container>) => {
              if (node instanceof Sprite) {
                const texture = node.texture;
                drawnTextures.add(
                  texture.label || texture.source.label || `generated:${texture.width}x${texture.height}`,
                );
              }
              for (const child of node.children) collectTextures(child as InstanceType<typeof Container>);
            };
            collectTextures(app.stage);
            element.dataset.sceneTextures = [...drawnTextures].sort().join(" ");
            diagnosticsCallback.current({
              routeSeconds: displayedSeconds,
              distance: displayedDistance,
              zoneId: activeZone.id,
              segmentIndex,
              segmentSignature: `${composedSegmentSignature(
                activeZone.id,
                segmentIndex,
                pools.map((pool) => pool.textures.length),
              )}:p${segmentVariant(activeZone.id, segmentIndex, 0, 12)}`,
              fps: Math.round(1_000 / Math.max(1, average)),
              p95FrameMs: Math.round(p95 * 10) / 10,
              liveObjects: visibleObjects,
              pooledObjects: pools.reduce((total, pool) => total + pool.sprites.length, 0) + props.length + groundLife.length + motes.length + 2,
              estimatedTextureBytes: estimatedTextureBytes
                + (transition ? transition.texture.width * transition.texture.height * 4 : 0)
                + 128 * 128 * 4,
            });
          }
        });

        const initialZoneIndex = routePositionAt(pack, displayedDistance).zoneIndex;
        const initialNextZone = pack.route.zones[(initialZoneIndex + 1) % pack.route.zones.length];
        void Assets.backgroundLoad(zoneAssetUrls(initialNextZone)).catch(() => undefined);
        await buildZone(initialZoneIndex);
        if (disposed) return;
        resize();
      } catch {
        if (!disposed) { cleanup(); cleanup = () => undefined; onFailure(); }
      }
    }

    void mount();
    return () => {
      disposed = true;
      onCaptureReady?.(null);
      cleanup();
    };
  }, [onFailure, onReady, onStageFrame, pack, qualityTier, contacts, gradeRef, onCaptureReady]);

  return <div className="pixi-scene" ref={host} aria-hidden="true" />;
}
