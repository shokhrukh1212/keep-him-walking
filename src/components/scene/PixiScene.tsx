"use client";

import { useEffect, useRef, type RefObject } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { Texture as PixiTexture } from "pixi.js";
import type { CountryPack, RouteProp, RouteZone } from "@/lib/content/schema";
import { dailyActiveWalkingSecondsAt, travelerMotionAt, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import {
  stageLayout,
  blendStageLayout,
  type StageFrame,
  type StageLayout,
} from "@/lib/world/stage-layout";
import { CHARACTER_HEIGHT_TARGETS } from "@/lib/world/stage-targets";
import type { TravelerCommand } from "@/lib/traveler/types";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { deterministicVariant, scenePositionAt, SCENE_VISIT_SECONDS } from "@/lib/world/route-clock";
import { segmentVariant } from "@/lib/world/segment-sequencer";
import { composedSegmentSignature } from "@/lib/world/segment-sequencer";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";
import { contactShadowLayout, gradeMatrix, type CharacterContacts, type VisualGrade } from "@/lib/world/visual-grade";
import type { ScheduledActionView } from "@/lib/contracts";
import type { JourneyWeather } from "@/lib/weather/open-meteo";
import { weatherEffect } from "@/lib/weather/effects";
import { combineGrade, gradeForHour, localHourFraction, nightMix } from "@/lib/world/time-grade";
import { birdFlights, buntingVisible, steamPuffs, tramPass } from "@/lib/world/ambient";
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
  /** Premium placement only: an approved sign texture drawn in the cafe zone. */
  sponsorSignUrl?: string | null;
  /** Server-confirmed hundred-watcher moment; bunting is never guessed locally. */
  hundredWatchersAt?: string | null;
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
  & { scheduledActions: readonly ScheduledActionView[]; weather: JourneyWeather | null; sponsorSignUrl: string | null;
      hundredWatchersAt: string | null };

export function PixiScene({
  pack,
  contacts,
  grade: gradeRef,
  onStageFrame,
  routeSeconds,
  routeRuntime,
  scheduledActions = EMPTY_SCHEDULED_ACTIONS,
  weather = null,
  sponsorSignUrl = null,
  hundredWatchersAt = null,
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
  const runtime = useRef<RuntimeRefs>({ routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, weather, sponsorSignUrl, hundredWatchersAt });
  const motionCallback = useRef(onMotionSample);
  const zoneCallback = useRef(onZoneChange);
  const diagnosticsCallback = useRef(onDiagnostics);
  const captureCallback = useRef(onCaptureReady);

  useEffect(() => {
    runtime.current = { routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, weather, sponsorSignUrl, hundredWatchersAt };
    motionCallback.current=onMotionSample;
    zoneCallback.current = onZoneChange;
    diagnosticsCallback.current = onDiagnostics;
    captureCallback.current = onCaptureReady;
  }, [command, onCaptureReady, onDiagnostics, onZoneChange, reducedMotion, routeRuntime, routeSeconds, scheduledActions, travelerCommand, weather, sponsorSignUrl, hundredWatchersAt, onMotionSample]);

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
        const nightRoot = new Container();
        const transitionRoot = new Container();
        const propRoot = new Container();
        const signRoot = new Container();
        // lifeRoot is a sibling of weatherStaticRoot, never a child of weatherRoot:
        // weatherRoot is emptied and destroyed on every zone rebuild, which would
        // take the birds and other ambient life with it.
        const lifeRoot = new Container();
        const lightsRoot = new Container();
        const groundLifeRoot = new Container();
        const groundDetailsRoot = new Container();
        const weatherRoot = new Container();
        // weatherRoot is emptied and destroyed on every zone rebuild, so the
        // long-lived fog band needs a container of its own.
        const weatherStaticRoot = new Container();
        const fogBand = new Graphics();
        const stormFlash = new Graphics();
        let precipitation: InstanceType<typeof Graphics>[] = [];
        let precipitationKind: "none" | "rain" | "snow" = "none";
        // The local hour and the weather move on the scale of minutes. Deriving
        // them every frame cost an Intl lookup and five DOM attribute writes per
        // frame for values that had not changed.
        let effect = weatherEffect(0, 0);
        let lastSkySampleAt = Number.NEGATIVE_INFINITY;
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
        // One for each person who can be passing on his pavement at once.
        const walkerShadows = Array.from({ length: QUALITY_LIMITS.high.walkers }, () => new Sprite(shadowTexture));
        for (const shadow of [...Object.values(shadows), ...walkerShadows]) { shadow.anchor.set(0.5); shadow.visible = false; }
        groundLifeRoot.addChild(groundDetailsRoot, ...walkerShadows, shadows.traveler, shadows.resident);
        // Draw order, back to front: sky, the panorama (or the legacy parallax
        // layers), props, ground life, weather. Nothing composites over the
        // painting itself.
        camera.addChild(sky, layerRoot, nightRoot, lightsRoot, transitionRoot, propRoot, signRoot, lifeRoot, groundLifeRoot, weatherRoot, weatherStaticRoot);
        // Lit windows add light to the painting rather than covering it.
        lightsRoot.blendMode = "add";
        weatherStaticRoot.addChild(fogBand);
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
          mode: "panorama" | "sky" | "city" | "ground" | "foreground" | "legacy";
        };
        type LoadedLayer = {
          layer: { id: string; speed: number; y: number; height: number };
          textures: PixiTexture[];
          mode: LayerPool["mode"];
        };
        type PropPool = {
          definition: RouteProp;
          display: InstanceType<typeof Graphics> | InstanceType<typeof Sprite>;
          illustrated: boolean;
          nativeHeight: number;
          slot: number;
        };
        const sign = {
          sprite: new Sprite(),
          url: null as string | null,
          ready: false,
          generation: 0,
        };
        sign.sprite.anchor.set(0.5, 0.5);
        sign.sprite.visible = false;
        signRoot.addChild(sign.sprite);

        // The ambient cast is drawn in code as simple shapes: no sprite sheets to
        // download, nothing to fall out of sync with a pack, and every shape is a
        // pure function of the authoritative second.
        const ambient = pack.schemaVersion === 3 ? pack.ambient : null;
        const birds = Array.from({ length: limits.birds }, () => {
          const bird = new Graphics();
          bird.visible = false;
          lifeRoot.addChild(bird);
          return bird;
        });
        const steam = Array.from({ length: 3 }, () => {
          const puff = new Graphics();
          puff.visible = false;
          lifeRoot.addChild(puff);
          return puff;
        });
        const tram = new Graphics();
        tram.visible = false;
        lifeRoot.addChild(tram);
        const bunting = new Graphics();
        bunting.visible = false;
        lifeRoot.addChild(bunting);
        const windowLights = new Sprite();
        windowLights.visible = false;
        lightsRoot.addChild(windowLights);
        const lights = { url: null as string | null, ready: false, generation: 0 };
        const night = { sprite: new Sprite(), ready: false };
        night.sprite.visible = false;
        nightRoot.addChild(night.sprite);
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
          ...(zone.continuousScene
            ? [
                zone.fallbackUrl,
                zone.continuousScene.skyUrl,
                zone.continuousScene.cityUrl,
                zone.continuousScene.groundUrl,
                ...(zone.continuousScene.foregroundUrl ? [zone.continuousScene.foregroundUrl] : []),
              ]
            : coherentPanorama
            ? [zone.fallbackUrl]
            : zone.layers.flatMap((layer) => layer.segments.map((segment) => segment.url))),
          ...(zone.nightUrl ? [zone.nightUrl] : []),
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
          const sprites = Array.from({ length: 1 }, () => {
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
          const outgoingZone = activeZone;
          const [panoramaTexture, nightTexture] = await Promise.all([
            Assets.load<PixiTexture>(publicAssetUrl(zone.fallbackUrl)),
            zone.nightUrl
              ? Assets.load<PixiTexture>(publicAssetUrl(zone.nightUrl))
              : Promise.resolve(null),
          ]);
          const continuous = zone.continuousScene;
          const loaded: LoadedLayer[] = continuous
            ? await (async () => {
                const [skyTexture, cityTexture, groundTexture, foregroundTexture] = await Promise.all([
                  Assets.load<PixiTexture>(publicAssetUrl(continuous.skyUrl)),
                  Assets.load<PixiTexture>(publicAssetUrl(continuous.cityUrl)),
                  Assets.load<PixiTexture>(publicAssetUrl(continuous.groundUrl)),
                  continuous.foregroundUrl
                    ? Assets.load<PixiTexture>(publicAssetUrl(continuous.foregroundUrl))
                    : Promise.resolve(null),
                ]);
                return [
                  { layer: { id: "sky", speed: 0.01, y: 0, height: 1 }, textures: [skyTexture], mode: "sky" as const },
                  { layer: { id: "city", speed: 0.08, y: 0, height: 1 }, textures: [cityTexture], mode: "city" as const },
                  { layer: { id: "ground", speed: 1, y: zone.stage.groundLineY, height: continuous.groundHeightFrac }, textures: [groundTexture], mode: "ground" as const },
                  ...(foregroundTexture
                    ? [{ layer: { id: "foreground", speed: 0.14, y: 0, height: 1 }, textures: [foregroundTexture], mode: "foreground" as const }]
                    : []),
                ];
              })()
            : coherentPanorama
            ? [{
                layer: { id: "coherent-panorama", speed: 0.055, y: 0, height: 1 },
                textures: [panoramaTexture],
                mode: "panorama",
              }]
            : await Promise.all(
              zone.layers.map(async (layer) => ({
                layer,
                textures: await Promise.all(
                  layer.segments.map((segment) => Assets.load<PixiTexture>(publicAssetUrl(segment.url))),
                ),
                mode: "legacy" as const,
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
          night.ready = Boolean(nightTexture);
          night.sprite.visible = false;
          if (nightTexture) night.sprite.texture = nightTexture;
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
          // The drops were just destroyed; the tick must not touch them again
          // until the rebuild below replaces them.
          precipitation = [];
          precipitationKind = "none";
          let sequenceLayerIndex = 0;
          pools = loaded.map(({ layer, textures, mode }, layerIndex) => {
            const container = new Container();
            layerRoot.addChild(container);
            const sprites = Array.from({ length: mode === "legacy" || mode === "ground" ? 6 : 1 }, () => {
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
              mode,
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
          if (outgoingZone && outgoingZone.id !== zone.id) {
            const retained = new Set(zoneAssetUrls(zone));
            for (const url of zoneAssetUrls(outgoingZone)) {
              if (!retained.has(url)) void Assets.unload(url).catch(() => undefined);
            }
          }
          if (!ready) {
            ready = true;
            onReady();
          }
        };

        const resize = () => {
          // resizeTo only listens for window resizes. The host can change size without one,
          // and until the world redraws at that size the characters wait for its frame.
          app.resize();
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
        let displayedWalkingSeconds = runtime.current.routeSeconds;
        let displayedDistance = runtime.current.routeRuntime.globalDistanceMetres;
        let elapsed = 0;
        let lastTickAt = performance.now();
        let lastDiagnosticAt = 0;
        let lastMotionAt=0;
        const frameSamples: number[] = [];
        // Pixi's extract re-renders into a texture, so it returns a correct
        // frame whether or not the drawing buffer was preserved.
        captureCallback.current?.(async () => {
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
          const sampleAt = performance.now();
          if (sampleAt - lastSkySampleAt >= 1_000) {
            lastSkySampleAt = sampleAt;
            const localHour = localHourFraction(new Date(), pack.timeZone);
            effect = weatherEffect(state.weather?.code ?? 0, state.weather?.windKmh ?? 0);
            gradeRef.current = combineGrade(gradeForHour(localHour), effect.contrastScale);
            worldGrade.matrix = gradeMatrix(gradeRef.current);
            element.dataset.grade = JSON.stringify(gradeRef.current);
            element.dataset.localHour = localHour.toFixed(3);
            element.dataset.nightMix = nightMix(localHour).toFixed(3);
            element.dataset.weatherKind = effect.precipitation;
            element.dataset.weatherParticles = String(
              effect.precipitation === "none" ? 0 : precipitation.length,
            );
          }
          const tickAt = performance.now();
          const wallDeltaMs = Math.min(500, Math.max(0, tickAt - lastTickAt));
          lastTickAt = tickAt;
          elapsed += wallDeltaMs;
          frameSamples.push(wallDeltaMs);
          if (frameSamples.length > 180) frameSamples.shift();
          clock.accept(state.routeRuntime, state.travelerCommand?.presenceTtlMs ?? 50_000, tickAt);
          const sample = clock.sample(tickAt, state.scheduledActions);
          const motion = travelerMotionAt(pack, sample.rawSeconds, sample.distanceMetres, state.scheduledActions);
          if(tickAt-lastMotionAt>=250) {lastMotionAt=tickAt;motionCallback.current?.({assetVersion:pack.assetVersion,motion});}
          displayedSeconds = sample.rawSeconds;
          displayedWalkingSeconds = dailyActiveWalkingSecondsAt(pack, sample.rawSeconds, state.scheduledActions);
          displayedDistance = sample.distanceMetres;

          const position = scenePositionAt(pack, displayedWalkingSeconds);
          const zoneDistance = position.visitProgress * (activeZone?.lengthMetres ?? 0);
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
          if (coherentPanorama) {
            const nextZoneIndex = (activeZoneIndex + 1) % pack.route.zones.length;
            if (position.zoneIndex === activeZoneIndex) {
              const remaining = Math.max(0, SCENE_VISIT_SECONDS - position.secondsIntoVisit);
              if (remaining <= 15) void prepareTransition(nextZoneIndex).catch(() => undefined);
              if (remaining <= 1 && transition?.zoneIndex === nextZoneIndex) {
                transitionAlpha = 1 - remaining;
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
          let activePaintingX = layout.imageX;
          for (const pool of pools) {
            if (pool.mode === "sky") {
              const texture = pool.textures[0];
              const scale = Math.max(width / texture.width, height / texture.height);
              const sprite = pool.sprites[0];
              sprite.scale.set(scale);
              sprite.position.set((width - texture.width * scale) / 2, (height - texture.height * scale) / 2);
              sprite.visible = true;
              continue;
            }
            if (pool.mode === "city" || pool.mode === "panorama") {
              const texture = pool.textures[0];
              activePaintingX = layout.imageX;
              element.dataset.panoramaOffset = "0";
              element.dataset.panoramaSpan = String(Math.max(1, texture.width * layout.imageScale));
              for (let slot = 0; slot < pool.sprites.length; slot += 1) {
                const sprite = pool.sprites[slot];
                sprite.texture = texture;
                sprite.scale.set(layout.imageScale);
                sprite.x = layout.imageX;
                sprite.y = layout.imageY;
                sprite.visible = slot === 0;
              }
              continue;
            }
            if (pool.mode === "ground") {
              const texture = pool.textures[0];
              const targetHeight = Math.max(height - layout.groundY, height * pool.height);
              const scale = targetHeight / Math.max(1, texture.height);
              const segmentWidth = Math.max(1, texture.width * scale);
              const offset = state.reducedMotion
                ? 0
                : ((groundPixels % segmentWidth) + segmentWidth) % segmentWidth;
              const first = -offset - segmentWidth;
              for (let slot = 0; slot < pool.sprites.length; slot += 1) {
                const sprite = pool.sprites[slot];
                sprite.texture = texture;
                sprite.scale.set(scale);
                sprite.position.set(first + slot * segmentWidth, layout.groundY);
                sprite.visible = sprite.x + segmentWidth > -4 && sprite.x < width + 4;
              }
              continue;
            }
            if (pool.mode === "foreground") {
              const sprite = pool.sprites[0];
              sprite.scale.set(layout.imageScale);
              sprite.position.set(activePaintingX, layout.imageY);
              sprite.visible = true;
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
            for (let slot = 0; slot < transition.sprites.length; slot += 1) {
              const sprite = transition.sprites[slot];
              sprite.scale.set(nextLayout.imageScale);
              sprite.x = nextLayout.imageX;
              sprite.y = nextLayout.imageY;
              sprite.visible = slot === 0 && transitionAlpha > 0;
            }
          }

          const nightAlpha = night.ready
            ? nightMix(Number(element.dataset.localHour ?? "12")) * (1 - transitionAlpha)
            : 0;
          night.sprite.visible = nightAlpha > 0.01;
          if (night.sprite.visible) {
            night.sprite.position.set(activePaintingX, layout.imageY);
            night.sprite.scale.set(layout.imageScale);
            night.sprite.alpha = nightAlpha;
          }
          element.dataset.nightTextureAlpha = nightAlpha.toFixed(3);

          const groundCamera = state.reducedMotion ? 0 : groundPixels;
          groundLifeRoot.x = -groundCamera;

          // Premium cafe sign. It hangs on the near plane and scrolls with the
          // pavement, so it reads as part of the street rather than an overlay.
          const signUrl = activeZone.kind === "cafe" ? state.sponsorSignUrl : null;
          if (signUrl !== sign.url) {
            sign.url = signUrl;
            sign.sprite.visible = false;
            // Drop the old texture's readiness immediately, or a sponsor change
            // would draw the previous logo until the replacement arrives.
            sign.ready = false;
            const generation = ++sign.generation;
            if (signUrl) {
              void Assets.load(signUrl).then((texture: PixiTexture) => {
                if (disposed || generation !== sign.generation) return;
                sign.sprite.texture = texture;
                sign.ready = true;
              }).catch(() => { sign.ready = false; });
            }
          }
          if (sign.ready && signUrl) {
            const signWidth = Math.min(width * 0.28, layout.personHeightPx * 1.6);
            sign.sprite.width = signWidth;
            sign.sprite.height = signWidth / 2;
            // Anchored to a fixed point on the street so every viewer sees it in
            // the same place, and wrapped over the zone so it recurs as he walks.
            const spacing = Math.max(width * 1.4, layout.personHeightPx * 9);
            const offset = ((-groundCamera % spacing) + spacing) % spacing;
            sign.sprite.position.set(offset + spacing * 0.25, layout.groundY - layout.personHeightPx * 1.55);
            sign.sprite.visible = sign.sprite.x > -signWidth && sign.sprite.x < width + signWidth;
          } else {
            sign.sprite.visible = false;
          }

          // ---- The city's own life. Every schedule below is a pure function of
          // the authoritative second, so two viewers see the same bird and tram
          // at the same moment. Decorative animals require reviewed artwork.
          const life = state.reducedMotion ? 0 : 1;
          const localHourNow = Number(element.dataset.localHour ?? "12");

          for (let index = 0; index < birds.length; index += 1) birds[index]!.visible = false;
          const flock = life ? birdFlights(displayedSeconds, pack.assetVersion, limits.birds, effect.windScale) : [];
          for (let index = 0; index < flock.length && index < birds.length; index += 1) {
            const flight = flock[index]!;
            const bird = birds[index]!;
            const span = width + 120;
            const x = flight.direction === 1 ? -60 + flight.progress * span : width + 60 - flight.progress * span;
            const y = height * flight.height;
            const wing = Math.sin(flight.wing * Math.PI * 2) * 5 * flight.scale;
            bird.clear();
            // A shallow "M": two strokes that flap around a shared centre.
            bird.moveTo(-9 * flight.scale, wing).lineTo(0, -2 * flight.scale).lineTo(9 * flight.scale, wing)
              .stroke({ color: 0x2c3a45, width: Math.max(1, 1.6 * flight.scale), alpha: 0.55 });
            bird.position.set(x, y);
            bird.visible = true;
          }

          // Steam from the cafe, rising and thinning as it goes.
          const steaming = life && activeZone.kind === "cafe";
          const puffs = steaming ? steamPuffs(displayedSeconds, steam.length) : [];
          for (let index = 0; index < steam.length; index += 1) {
            const puff = steam[index]!;
            const scheduled = puffs[index];
            puff.visible = Boolean(scheduled);
            if (!scheduled) continue;
            const rise = layout.personHeightPx * 0.9 * scheduled.progress;
            const radius = layout.personHeightPx * (0.05 + scheduled.progress * 0.09);
            puff.clear();
            puff.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 0.22 * (1 - scheduled.progress) });
            puff.position.set(
              width * 0.74 + scheduled.drift * layout.personHeightPx * 0.08,
              layout.groundY - layout.personHeightPx * 1.15 - rise,
            );
          }

          // A tram silhouette crosses the arrival zone, for cities that run one.
          const tramNow = life && ambient?.tram && activeZone.kind === "arrival"
            ? tramPass(displayedSeconds, pack.assetVersion)
            : { active: false, progress: 0, direction: 1 as const };
          tram.visible = tramNow.active;
          if (tramNow.active) {
            const carHeight = layout.personHeightPx * 0.82;
            const carWidth = carHeight * 3.4;
            const span = width + carWidth * 2;
            const x = tramNow.direction === 1
              ? -carWidth + tramNow.progress * span
              : width + carWidth - tramNow.progress * span;
            tram.clear();
            tram.roundRect(0, 0, carWidth, carHeight, carHeight * 0.14).fill({ color: 0x2b3c47, alpha: 0.34 });
            for (let window = 0; window < 5; window += 1) {
              tram.rect(carWidth * (0.1 + window * 0.17), carHeight * 0.2, carWidth * 0.1, carHeight * 0.3)
                .fill({ color: 0xf4e2b8, alpha: 0.2 });
            }
            tram.position.set(x, layout.groundY - carHeight);
          }

          // Bunting, only once the server has confirmed a hundred watchers at once.
          const buntingUp = activeZone.kind === "market"
            && buntingVisible(state.hundredWatchersAt, new Date());
          bunting.visible = buntingUp;
          if (buntingUp) {
            const top = layout.groundY - layout.personHeightPx * 1.9;
            const sag = layout.personHeightPx * 0.22;
            bunting.clear();
            bunting.moveTo(0, top).quadraticCurveTo(width / 2, top + sag, width, top)
              .stroke({ color: 0xf2e0bb, width: 2, alpha: 0.7 });
            const flags = Math.max(6, Math.round(width / 90));
            for (let flag = 0; flag <= flags; flag += 1) {
              const t = flag / flags;
              const x = t * width;
              // The same quadratic the line follows, so the flags hang off it.
              const y = (1 - t) * (1 - t) * top + 2 * (1 - t) * t * (top + sag) + t * t * top;
              const size = layout.personHeightPx * 0.09;
              const colour = [0xd8734f, 0xe9c05c, 0x62a08a][deterministicVariant(`${pack.assetVersion}:bunting`, flag, 3)]!;
              bunting.moveTo(x - size * 0.5, y).lineTo(x + size * 0.5, y).lineTo(x, y + size)
                .fill({ color: colour, alpha: 0.78 });
            }
          }

          // Lit windows: the zone's own night overlay, faded in on the same dusk
          // ramp as the night grade. Absent art simply means no lights.
          const lightsUrl = activeZone.lightsUrl ? publicAssetUrl(activeZone.lightsUrl) : null;
          if (lightsUrl !== lights.url) {
            lights.url = lightsUrl;
            lights.ready = false;
            windowLights.visible = false;
            const generation = ++lights.generation;
            if (lightsUrl) {
              void Assets.load(lightsUrl).then((texture: PixiTexture) => {
                if (disposed || generation !== lights.generation) return;
                windowLights.texture = texture;
                lights.ready = true;
              }).catch(() => { lights.ready = false; });
            }
          }
          const lightAlpha = lights.ready ? nightMix(localHourNow) : 0;
          windowLights.visible = lightAlpha > 0.01;
          if (windowLights.visible) {
            windowLights.position.set(layout.imageX, layout.imageY);
            windowLights.scale.set(layout.imageScale);
            windowLights.alpha = lightAlpha * 0.85;
          }
          element.dataset.windowLightAlpha = lightAlpha.toFixed(3);
          element.dataset.birdsVisible = String(birds.filter((bird) => bird.visible).length);
          // Kept as a diagnostic compatibility marker after the broken
          // procedural animal was removed from the launch renderer.
          element.dataset.catVisible = "false";
          element.dataset.buntingVisible = String(bunting.visible);

          const placeShadow = (
            shadow: InstanceType<typeof Sprite>, contact: CharacterContacts["traveler"] | undefined,
          ) => {
            shadow.visible = Boolean(contact);
            if (!contact) return null;
            const placement = contactShadowLayout(contact, groundCamera);
            shadow.position.set(placement.x, placement.y);
            shadow.width = placement.radiusX * 2;
            shadow.height = placement.radiusY * 2;
            shadow.alpha = placement.alpha;
            return placement;
          };
          const travelerShadow = placeShadow(shadows.traveler, contacts.current.traveler);
          placeShadow(shadows.resident, contacts.current.resident);
          if (travelerShadow) {
            element.dataset.shadowX = String(shadows.traveler.x + groundLifeRoot.x);
            element.dataset.shadowY = String(shadows.traveler.y);
            element.dataset.shadowRadiusX = String(travelerShadow.radiusX);
          }
          walkerShadows.forEach((shadow, index) => placeShadow(shadow, contacts.current.walkers?.[index]));
          element.dataset.shadowVisible = String(shadows.traveler.visible);
          element.dataset.walkerShadows = String(walkerShadows.filter((shadow) => shadow.visible).length);
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
              + motes.length + [...Object.values(shadows), ...walkerShadows].filter((shadow) => shadow.visible).length;
            // Test-observable inventory of every texture the world holds on the
            // stage. Assets.load stamps the resolved URL onto the texture label;
            // textures built in the browser (a canvas, a render target) have no
            // URL, so they are recorded by size instead. A regression that
            // reintroduces a retired layer then fails in Playwright rather than
            // only in visual review.
            const drawnTextures = new Set<string>();
            const collectTextures = (node: InstanceType<typeof Container>) => {
              // Only what is actually on screen. A hidden sprite that is waiting
              // for its texture — the cafe sign before a premium sponsor, the
              // window lights before dusk — is not something the world is drawing,
              // and counting it would report a texture nobody can see.
              if (!node.visible) return;
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

        const initialZoneIndex = scenePositionAt(pack, displayedWalkingSeconds).zoneIndex;
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
      captureCallback.current?.(null);
      cleanup();
    };
  }, [onFailure, onReady, onStageFrame, pack, qualityTier, contacts, gradeRef]);

  return <div className="pixi-scene" ref={host} aria-hidden="true" />;
}
