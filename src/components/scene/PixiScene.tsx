"use client";

import { useEffect, useRef, type RefObject } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { Container as PixiContainer, Graphics as PixiGraphics, Sprite as PixiSprite, Texture as PixiTexture } from "pixi.js";
import type { CountryPack, RouteZone } from "@/lib/content/schema";
import { travelerMotionAt, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
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
import { activeWalkingSecondsAt, deterministicVariant, scenePositionAt } from "@/lib/world/route-clock";
import { composedSegmentSignature, segmentVariant } from "@/lib/world/segment-sequencer";
import type {
  QualityTier,
  RouteRuntime,
  SceneAssetState,
  WalkingClock,
  WorldCommand,
  WorldDiagnosticsSnapshot,
} from "@/lib/world/types";
import { contactShadowLayout, gradeMatrix, type CharacterContacts, type VisualGrade } from "@/lib/world/visual-grade";
import type { ScheduledActionView } from "@/lib/contracts";
import type { JourneyWeather } from "@/lib/weather/open-meteo";
import { weatherEffect } from "@/lib/weather/effects";
import { combineGrade, gradeForHour, localHourFraction, nightMix } from "@/lib/world/time-grade";
import { birdFlights, buntingVisible, steamPuffs, tramPass } from "@/lib/world/ambient";
import {
  placeLoadPlan,
  placeRenditions,
  renditionRequestFor,
  shouldReplaceRendition,
  type PlaceRenditions,
  type RenditionChoice,
} from "@/lib/world/scene-assets";
import { PlaceTextureCache, textureRetryDelayMs } from "@/lib/world/texture-cache";
import type { CanvasCapture } from "@/components/traveler/ProductCharacterStage3D";

const EMPTY_SCHEDULED_ACTIONS: readonly ScheduledActionView[] = [];
/** The next place fades in over the last walking second before the shared clock reaches it. */
const CROSSFADE_SECONDS = 1;
/** A painting that arrives after its moment fades in over the one it replaces. */
const LATE_FADE_MS = 400;
/** Waits for a resize to settle before asking for a sharper rendition. */
const UPGRADE_SETTLE_MS = 500;
/** Every Pixi application this page has created; a remount shows up as a jump. */
let worldMounts = 0;

type Props = {
  pack: CountryPack;
  contacts: RefObject<CharacterContacts>;
  grade: RefObject<VisualGrade>;
  onStageFrame: (frame: StageFrame, source: "static" | "pixi") => void;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
  scheduledActions?: readonly ScheduledActionView[];
  walkingClock?: WalkingClock | null;
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
  /** A painting of this place is now on screen. */
  onZoneChange: (zoneId: string, zoneLabel: string) => void;
  onAssetState?: (state: SceneAssetState) => void;
  onDiagnostics: (snapshot: WorldDiagnosticsSnapshot) => void;
  onReady: () => void;
  /** WebGL could not start. A painting that fails to load is retried instead. */
  onFailure: () => void;
};

type RuntimeRefs = Pick<Props, "routeSeconds" | "routeRuntime" | "command" | "reducedMotion" | "travelerCommand">
  & { scheduledActions: readonly ScheduledActionView[]; walkingClock: WalkingClock | null; weather: JourneyWeather | null;
      sponsorSignUrl: string | null; hundredWatchersAt: string | null };

/** One place's drawable layers. Sprites belong to the view; textures belong to the cache. */
type PlaceView = {
  zoneIndex: number;
  zone: RouteZone;
  renditions: PlaceRenditions;
  urls: string[];
  nominalWidth: number;
  nominalHeight: number;
  root: PixiContainer;
  sky: PixiSprite | null;
  city: PixiSprite;
  ground: PixiSprite[];
  foreground: PixiSprite | null;
  night: { sprite: PixiSprite; url: string | null; state: "idle" | "loading" | "ready" | "failed" };
  bytes: number;
  released: boolean;
};

function zoneHasTag(zone: RouteZone, tag: string): boolean {
  return zone.tags.includes(tag) || zone.kind === tag;
}

function sameRenditions(left: PlaceRenditions, right: PlaceRenditions): boolean {
  return left.city.url === right.city.url
    && left.sky?.url === right.sky?.url
    && left.ground?.url === right.ground?.url;
}

export function PixiScene({
  pack,
  contacts,
  grade: gradeRef,
  onStageFrame,
  routeSeconds,
  routeRuntime,
  scheduledActions = EMPTY_SCHEDULED_ACTIONS,
  walkingClock = null,
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
  onAssetState,
  onDiagnostics,
  onReady,
  onFailure,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<RuntimeRefs>({ routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, walkingClock, weather, sponsorSignUrl, hundredWatchersAt });
  const motionCallback = useRef(onMotionSample);
  const zoneCallback = useRef(onZoneChange);
  const assetStateCallback = useRef(onAssetState);
  const diagnosticsCallback = useRef(onDiagnostics);
  const captureCallback = useRef(onCaptureReady);

  useEffect(() => {
    runtime.current = { routeSeconds, routeRuntime, command, reducedMotion, travelerCommand, scheduledActions, walkingClock, weather, sponsorSignUrl, hundredWatchersAt };
    motionCallback.current=onMotionSample;
    zoneCallback.current = onZoneChange;
    assetStateCallback.current = onAssetState;
    diagnosticsCallback.current = onDiagnostics;
    captureCallback.current = onCaptureReady;
  }, [command, onAssetState, onCaptureReady, onDiagnostics, onZoneChange, reducedMotion, routeRuntime, routeSeconds, scheduledActions, walkingClock, travelerCommand, weather, sponsorSignUrl, hundredWatchersAt, onMotionSample]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined;

    async function mount() {
      const element = host.current;
      if (!element) return;
      try {
        const pixi = await import("pixi.js");
        // Registers renderer.prepare, which uploads the next painting to the GPU
        // well before it is shown. It must be registered before the renderer exists.
        await import("pixi.js/prepare").catch(() => undefined);
        const { Application, Assets, Container, Graphics, Sprite, Texture, ColorMatrixFilter } = pixi;
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
        worldMounts += 1;
        element.dataset.mountCount = String(worldMounts);
        cleanup = () => { app.destroy(true, { children: true }); return undefined; };
        app.ticker.maxFPS = limits.targetFps;
        app.canvas.setAttribute("aria-hidden", "true");
        element.appendChild(app.canvas);

        const camera = new Container();
        const sky = new Graphics();
        // The current place, with a late-arriving replacement fading in on top of it.
        const placeRoot = new Container();
        // The next place, shown only during its crossfade.
        const transitionRoot = new Container();
        const signRoot = new Container();
        const lifeRoot = new Container();
        const lightsRoot = new Container();
        const groundLifeRoot = new Container();
        const groundDetailsRoot = new Container();
        const weatherRoot = new Container();
        const weatherStaticRoot = new Container();
        const fogBand = new Graphics();
        const stormFlash = new Graphics();
        // The local hour and the weather move on the scale of minutes. Deriving
        // them every frame cost an Intl lookup and five DOM attribute writes per
        // frame for values that had not changed.
        let effect = weatherEffect(0, 0);
        let lastSkySampleAt = Number.NEGATIVE_INFINITY;
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
        // Draw order, back to front: the neutral street, the place (sky, painting,
        // pavement, night), window light, the incoming place, then life and weather.
        camera.addChild(sky, placeRoot, lightsRoot, transitionRoot, signRoot, lifeRoot, groundLifeRoot, weatherRoot, weatherStaticRoot);
        lightsRoot.blendMode = "add";
        weatherStaticRoot.addChild(fogBand);
        app.stage.addChild(stormFlash);
        app.stage.addChild(camera);
        const clock = new PresentationClock();

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

        // Street life, motes and weather belong to the world, not to a place, so a
        // place change never rebuilds them.
        const groundLife: PixiGraphics[] = Array.from({ length: qualityTier === "low" ? 7 : 12 }, () => {
          const detail = new Graphics();
          groundDetailsRoot.addChild(detail);
          return detail;
        });
        let groundLifeZoneId: string | null = null;
        const recolorGroundLife = (zone: RouteZone) => {
          groundLife.forEach((detail, index) => {
            const color = index % 3 === 0 ? zone.lighting.skyBottom : zone.lighting.grade;
            detail.clear();
            if (index % 2 === 0) {
              detail.ellipse(0, 0, 18 + (index % 4) * 6, 3 + (index % 3)).fill({ color, alpha: 0.13 });
            } else {
              detail.roundRect(-12, -2, 24 + (index % 5) * 5, 4, 2).fill({ color, alpha: 0.12 });
            }
          });
        };
        const motes = Array.from({ length: limits.motes }, (_, index) => {
          const mote = new Graphics();
          mote.circle(0, 0, 1 + (index % 3) * 0.7).fill({ color: 0xffe4a1, alpha: 0.3 });
          weatherRoot.addChild(mote);
          return mote;
        });
        // Rain and snow are a real signal, not decoration, so even the low
        // tier gets enough particles to read as weather.
        const precipitationCount = qualityTier === "high" ? 42 : qualityTier === "medium" ? 28 : 14;
        const precipitation = Array.from({ length: precipitationCount }, () => {
          const drop = new Graphics();
          drop.visible = false;
          weatherRoot.addChild(drop);
          return drop;
        });
        let precipitationKind: "none" | "rain" | "snow" = "none";

        // ---- Places. Only the current place and, in its last moments, the next
        // one are ever held; a released texture is unloaded one per frame.
        const cache = new PlaceTextureCache<PixiTexture>({
          load: (url) => Assets.load<PixiTexture>(url),
          unload: (url) => Assets.unload(url),
        });
        let current: PlaceView | null = null;
        let incoming: PlaceView | null = null;
        let fading: { view: PlaceView; startedAt: number; startAlpha: number } | null = null;
        const pendingZones = new Set<number>();
        const retries = new Map<number, { attempt: number; notBefore: number }>();
        let plan: { current: number; next: number | null } = { current: -1, next: null };
        let assetState: SceneAssetState = "loading";
        let upgradeCheckAt = 0;
        let ready = false;
        let displayedLayout: StageLayout | null = null;
        let previousLayout: StageLayout | null = null;
        let layoutChangedAt = 0;
        let lastWidth = 0, lastHeight = 0;

        const setAssetState = (next: SceneAssetState) => {
          if (next === assetState) return;
          assetState = next;
          element.dataset.sceneAssetState = next;
          assetStateCallback.current?.(next);
        };
        element.dataset.sceneAssetState = assetState;
        const markReady = () => {
          if (ready) return;
          ready = true;
          onReady();
        };

        const renditionsFor = (zone: RouteZone) => placeRenditions(
          zone,
          renditionRequestFor(zone, app.screen.width, app.screen.height, app.renderer.resolution),
        );

        const loadPlace = async (zoneIndex: number, renditions: PlaceRenditions): Promise<PlaceView> => {
          const zone = pack.route.zones[zoneIndex]!;
          const foregroundUrl = zone.variants ? null : zone.continuousScene?.foregroundUrl ?? null;
          const urls = [...new Set(
            [renditions.city.url, renditions.sky?.url, renditions.ground?.url, foregroundUrl]
              .filter((url): url is string => Boolean(url))
              .map(publicAssetUrl),
          )];
          const settled = await Promise.allSettled(urls.map((url) => cache.acquire(url)));
          const failure = settled.find((result) => result.status === "rejected");
          if (failure || disposed) {
            settled.forEach((result, index) => { if (result.status === "fulfilled") cache.release(urls[index]!); });
            throw failure?.status === "rejected" ? failure.reason : new Error("World disposed");
          }
          const texture = (url: string | null | undefined): PixiTexture | null => {
            if (!url) return null;
            const result = settled[urls.indexOf(publicAssetUrl(url))];
            return result?.status === "fulfilled" ? result.value : null;
          };
          const cityTexture = texture(renditions.city.url)!;
          const root = new Container();
          root.label = `place:${zone.id}`;
          const skyTexture = texture(renditions.sky?.url);
          const skySprite = skyTexture ? new Sprite(skyTexture) : null;
          const city = new Sprite(cityTexture);
          const groundTexture = texture(renditions.ground?.url);
          const groundContainer = new Container();
          const ground = groundTexture
            ? Array.from({ length: 6 }, () => {
                const tile = new Sprite(groundTexture);
                groundContainer.addChild(tile);
                return tile;
              })
            : [];
          const foregroundTexture = texture(foregroundUrl);
          const foreground = foregroundTexture ? new Sprite(foregroundTexture) : null;
          const nightSprite = new Sprite(Texture.EMPTY);
          nightSprite.visible = false;
          for (const child of [skySprite, city, groundContainer, foreground, nightSprite]) {
            if (child) root.addChild(child);
          }
          return {
            zoneIndex,
            zone,
            renditions,
            urls,
            nominalWidth: renditions.nominal?.width ?? cityTexture.width,
            nominalHeight: renditions.nominal?.height ?? cityTexture.height,
            root,
            sky: skySprite,
            city,
            ground,
            foreground,
            night: { sprite: nightSprite, url: null, state: "idle" },
            bytes: settled.reduce((total, result) => total
              + (result.status === "fulfilled" ? result.value.width * result.value.height * 4 : 0), 0),
            released: false,
          };
        };

        const releaseView = (view: PlaceView) => {
          if (view.released) return;
          view.released = true;
          view.root.parent?.removeChild(view.root);
          view.root.destroy({ children: true });
          for (const url of view.urls) cache.release(url);
          if (view.night.url) cache.release(view.night.url);
        };

        // Night art is fetched only once dusk begins, never with the day painting.
        const ensureNight = (view: PlaceView) => {
          if (!view.renditions.night || view.night.state !== "idle") return;
          const url = publicAssetUrl(view.renditions.night.url);
          view.night.state = "loading";
          cache.acquire(url).then((texture) => {
            if (disposed || view.released) {
              cache.release(url);
              return;
            }
            view.night.url = url;
            view.night.sprite.texture = texture;
            view.night.state = "ready";
            view.bytes += texture.width * texture.height * 4;
          }, () => {
            if (!view.released) view.night.state = "failed";
          });
        };

        const promote = (view: PlaceView, tickAt: number, shownAlpha: number) => {
          const outgoing = current;
          current = view;
          if (incoming === view) incoming = null;
          placeRoot.addChild(view.root);
          view.root.visible = true;
          if (outgoing && outgoing !== view) {
            if (shownAlpha >= 0.98 || outgoing.zone.id === view.zone.id) {
              releaseView(outgoing);
              view.root.alpha = 1;
            } else {
              if (fading) releaseView(fading.view);
              fading = { view: outgoing, startedAt: tickAt, startAlpha: shownAlpha };
              view.root.alpha = shownAlpha;
            }
          } else {
            view.root.alpha = 1;
          }
          if (!outgoing || outgoing.zone.id !== view.zone.id) {
            previousLayout = displayedLayout;
            layoutChangedAt = tickAt;
            zoneCallback.current(view.zone.id, view.zone.label);
          }
          retries.delete(view.zoneIndex);
          upgradeCheckAt = tickAt + UPGRADE_SETTLE_MS;
          setAssetState("ready");
          markReady();
        };

        const requestPlace = (zoneIndex: number) => {
          const zone = pack.route.zones[zoneIndex];
          if (!zone || pendingZones.has(zoneIndex)) return;
          const renditions = renditionsFor(zone);
          pendingZones.add(zoneIndex);
          void loadPlace(zoneIndex, renditions).then((view) => {
            pendingZones.delete(zoneIndex);
            if (disposed) return;
            if (zoneIndex === plan.current) {
              if (current?.zoneIndex === zoneIndex && sameRenditions(current.renditions, view.renditions)) {
                releaseView(view);
                return;
              }
              promote(view, performance.now(), 0);
            } else if (zoneIndex === plan.next && !incoming) {
              incoming = view;
              view.root.visible = false;
              transitionRoot.addChild(view.root);
              retries.delete(zoneIndex);
              if (nightMix(Number(element.dataset.localHour ?? "12")) > 0.01) ensureNight(view);
              const prepare = (app.renderer as unknown as { prepare?: { upload(item: unknown): Promise<void> } }).prepare;
              void prepare?.upload(view.root).catch(() => undefined);
            } else {
              releaseView(view);
            }
          }, (error: unknown) => {
            pendingZones.delete(zoneIndex);
            if (disposed) return;
            const attempt = retries.get(zoneIndex)?.attempt ?? 0;
            retries.set(zoneIndex, { attempt: attempt + 1, notBefore: performance.now() + textureRetryDelayMs(attempt) });
            if (process.env.NODE_ENV !== "production") {
              console.warn(`World place ${zone.id} did not load; keeping the last painting and retrying`, error);
            }
          });
        };

        const placePainting = (sprite: PixiSprite, choice: RenditionChoice, view: PlaceView, layout: StageLayout) => {
          // Layout is in nominal painting pixels, so a smaller or cropped rendition
          // lands exactly where the full painting would.
          const coverWidth = choice.nominalWidth || view.nominalWidth;
          sprite.position.set(layout.imageX + choice.nominalLeft * layout.imageScale, layout.imageY);
          sprite.width = coverWidth * layout.imageScale;
          sprite.height = view.nominalHeight * layout.imageScale;
        };

        const layoutFor = (view: PlaceView, width: number, height: number) => stageLayout(
          width, height, view.nominalWidth, view.nominalHeight, view.zone.stage, CHARACTER_HEIGHT_TARGETS,
        );

        const drawView = (
          view: PlaceView, layout: StageLayout, width: number, height: number,
          groundPixels: number, still: boolean, nightAlpha: number,
        ) => {
          if (view.sky) {
            const texture = view.sky.texture;
            const scale = Math.max(width / Math.max(1, texture.width), height / Math.max(1, texture.height));
            view.sky.scale.set(scale);
            view.sky.position.set((width - texture.width * scale) / 2, (height - texture.height * scale) / 2);
          }
          placePainting(view.city, view.renditions.city, view, layout);
          const firstTile = view.ground[0];
          if (firstTile) {
            const texture = firstTile.texture;
            const targetHeight = Math.max(height - layout.groundY, height * (view.zone.continuousScene?.groundHeightFrac ?? 0.22));
            const scale = targetHeight / Math.max(1, texture.height);
            const segmentWidth = Math.max(1, texture.width * scale);
            // Only the pavement moves: it is the one layer tied to distance.
            const offset = still ? 0 : ((groundPixels % segmentWidth) + segmentWidth) % segmentWidth;
            const first = -offset - segmentWidth;
            for (let slot = 0; slot < view.ground.length; slot += 1) {
              const tile = view.ground[slot]!;
              tile.scale.set(scale);
              tile.position.set(first + slot * segmentWidth, layout.groundY);
              tile.visible = tile.x + segmentWidth > -4 && tile.x < width + 4;
            }
          }
          if (view.foreground) {
            view.foreground.scale.set(layout.imageScale);
            view.foreground.position.set(layout.imageX, layout.imageY);
          }
          view.night.sprite.visible = view.night.state === "ready" && nightAlpha > 0.01;
          if (view.night.sprite.visible && view.renditions.night) {
            placePainting(view.night.sprite, view.renditions.night, view, layout);
            view.night.sprite.alpha = nightAlpha;
          }
        };

        const resize = () => {
          // resizeTo only listens for window resizes. The host can change size without one,
          // and until the world redraws at that size the characters wait for its frame.
          app.resize();
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
        resize();

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
          // Freeing a released texture costs a little; never more than one per frame.
          cache.drainOne();
          clock.accept(state.routeRuntime, state.travelerCommand?.presenceTtlMs ?? 50_000, tickAt);
          const sample = clock.sample(tickAt, state.scheduledActions);
          const motion = travelerMotionAt(pack, sample.rawSeconds, sample.distanceMetres, state.scheduledActions, state.walkingClock);
          if(tickAt-lastMotionAt>=250) {lastMotionAt=tickAt;motionCallback.current?.({assetVersion:pack.assetVersion,motion});}
          displayedSeconds = sample.rawSeconds;
          displayedWalkingSeconds = activeWalkingSecondsAt(sample.rawSeconds, state.scheduledActions, state.walkingClock);
          displayedDistance = sample.distanceMetres;

          const position = scenePositionAt(pack, displayedWalkingSeconds);
          plan = placeLoadPlan(position);
          const retryDue = (zoneIndex: number) => (retries.get(zoneIndex)?.notBefore ?? 0) <= tickAt;
          let incomingAlpha = 0;
          if (incoming && current && incoming.zoneIndex === plan.next) {
            const remaining = Math.max(0, position.secondsToNextVisit);
            incomingAlpha = remaining <= CROSSFADE_SECONDS ? 1 - remaining / CROSSFADE_SECONDS : 0;
          }
          if (current?.zoneIndex !== plan.current && incoming?.zoneIndex === plan.current) {
            // The shared clock reached the prepared place: it was fading in already.
            const shown = incoming.root.visible ? incoming.root.alpha : 0;
            promote(incoming, tickAt, shown);
          }
          if (current?.zoneIndex !== plan.current && retryDue(plan.current)) requestPlace(plan.current);
          if (plan.next !== null && incoming?.zoneIndex !== plan.next && current?.zoneIndex !== plan.next && retryDue(plan.next)) {
            requestPlace(plan.next);
          }
          if (incoming && incoming.zoneIndex !== plan.next && incoming.zoneIndex !== plan.current) {
            releaseView(incoming);
            incoming = null;
          }
          if (current?.zoneIndex === plan.current) {
            setAssetState("ready");
          } else if (retries.has(plan.current)) {
            // Keep whatever painting is up; a neutral street only when there is none.
            setAssetState(current ? "retrying" : "fallback");
            if (!current) markReady();
          } else if (!current) {
            setAssetState("loading");
          }
          // Until the first painting or the fallback, the static poster owns the frame.
          if (!current && assetState !== "fallback") return;

          const drawnZone = current?.zone ?? pack.route.zones[plan.current]!;
          if (groundLifeZoneId !== drawnZone.id) {
            groundLifeZoneId = drawnZone.id;
            recolorGroundLife(drawnZone);
          }
          const nominalWidth = current?.nominalWidth ?? drawnZone.variants?.nominalWidth ?? 1_600;
          const nominalHeight = current?.nominalHeight ?? drawnZone.variants?.nominalHeight ?? 900;
          const width = app.screen.width;
          const height = app.screen.height;
          const targetLayout = stageLayout(
            width, height, nominalWidth, nominalHeight, drawnZone.stage, CHARACTER_HEIGHT_TARGETS,
          );
          // Resizing immediately reanchors both canvases; place switches ease for 400 ms.
          if (width !== lastWidth || height !== lastHeight) {
            previousLayout = null;
            if (current) upgradeCheckAt = tickAt + UPGRADE_SETTLE_MS;
          }
          lastWidth = width; lastHeight = height;
          const layout = previousLayout
            ? blendStageLayout(previousLayout, targetLayout, tickAt - layoutChangedAt) : targetLayout;
          displayedLayout = layout;
          onStageFrame({ assetVersion: pack.assetVersion, zoneId: drawnZone.id,
            viewportW: width, viewportH: height, imageW: nominalWidth, imageH: nominalHeight, stage: drawnZone.stage, layout }, "pixi");

          // A viewport that grew needs a sharper or uncropped rendition; the layout
          // is nominal, so the swap moves nothing.
          if (current && upgradeCheckAt > 0 && tickAt >= upgradeCheckAt && !pendingZones.has(current.zoneIndex)) {
            upgradeCheckAt = 0;
            const wanted = renditionsFor(current.zone);
            if (shouldReplaceRendition(current.renditions.city, wanted.city)
              || shouldReplaceRendition(current.renditions.ground, wanted.ground)) {
              requestPlace(current.zoneIndex);
            }
          }

          const groundPixels=displayedDistance*layout.pxPerMetre;
          element.dataset.groundY = String(layout.groundY);
          element.dataset.personHeight = String(layout.personHeightPx);
          element.dataset.characterImageScale = String(layout.characterImageScale);
          if (current) element.dataset.zoneId = current.zone.id;
          else delete element.dataset.zoneId;
          sky.clear().rect(0, 0, width, height).fill(drawnZone.lighting.skyTop);
          // Width-fit can leave space below the image too: extend only the pavement colour.
          sky.rect(0, layout.groundY, width, height - layout.groundY).fill(drawnZone.stage.palette[0]);
          element.dataset.gaitPhase=String(motion.cyclePhase);
          element.dataset.characterState=sample.traveling ? motion.action?.state ?? "walk" : "idle";
          element.dataset.actionReview=String(Boolean(state.travelerCommand?.actionReview&&state.travelerCommand.actionReview.action!=="auto"));
          element.dataset.groundPixels=String(groundPixels);
          camera.pivot.set(width / 2, height / 2);
          camera.position.set(width / 2, height / 2);
          camera.scale.set(1);
          groundDetailsRoot.alpha = 0.75 + state.command.backgroundLife * 0.25;
          weatherRoot.alpha = 0.5 + state.command.backgroundLife * 0.5;
          element.dataset.zoneTransition = String(incomingAlpha);
          element.dataset.panoramaOffset = "0";
          element.dataset.panoramaSpan = String(Math.max(1, nominalWidth * layout.imageScale));

          const localHourNow = Number(element.dataset.localHour ?? "12");
          const nightAmount = nightMix(localHourNow);
          if (current) {
            if (nightAmount > 0.01) ensureNight(current);
            drawView(current, layout, width, height, groundPixels, state.reducedMotion, nightAmount);
          }
          if (fading) {
            const progress = Math.min(1, (tickAt - fading.startedAt) / LATE_FADE_MS);
            if (current) current.root.alpha = Math.max(fading.startAlpha, progress);
            drawView(fading.view, layoutFor(fading.view, width, height), width, height, groundPixels, state.reducedMotion, nightAmount);
            if (progress >= 1) {
              releaseView(fading.view);
              fading = null;
              if (current) current.root.alpha = 1;
            }
          }
          if (incoming) {
            incoming.root.visible = incomingAlpha > 0;
            if (incoming.root.visible) {
              if (nightAmount > 0.01) ensureNight(incoming);
              incoming.root.alpha = incomingAlpha;
              drawView(incoming, layoutFor(incoming, width, height), width, height, groundPixels, state.reducedMotion, nightAmount);
            }
          }
          element.dataset.nightTextureAlpha = (current?.night.sprite.visible ? nightAmount * (1 - incomingAlpha) : 0).toFixed(3);

          const groundCamera = state.reducedMotion ? 0 : groundPixels;
          groundLifeRoot.x = -groundCamera;

          // Premium cafe sign. It hangs on the near plane and scrolls with the
          // pavement, so it reads as part of the street rather than an overlay.
          const signUrl = current && zoneHasTag(current.zone, "cafe") ? state.sponsorSignUrl : null;
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
          const steaming = life && current && zoneHasTag(current.zone, "cafe");
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
          const tramNow = life && ambient?.tram && zoneHasTag(drawnZone, "arrival")
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
          const buntingUp = zoneHasTag(drawnZone, "market")
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
          const lightsUrl = current?.zone.lightsUrl ? publicAssetUrl(current.zone.lightsUrl) : null;
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
          const lightAlpha = lights.ready ? nightMix(localHourNow) * (1 - incomingAlpha) : 0;
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
            shadow: PixiSprite, contact: CharacterContacts["traveler"] | undefined,
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
            const detail = groundLife[index]!;
            const streamIndex = firstGround + index;
            const jitter = deterministicVariant(`${drawnZone.id}:ground-life`, streamIndex, 95);
            detail.x = streamIndex * groundSpacing + jitter;
            detail.y = layout.groundY + layout.personHeightPx * (0.03 + (index % 3) * 0.06);
            detail.scale.set((0.75 + (index % 4) * 0.12) * height / 900);
            detail.visible = detail.x - groundCamera > -100 && detail.x - groundCamera < width + 100;
          }

          for (let index = 0; index < motes.length; index += 1) {
            const mote = motes[index]!;
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
            const horizon = height * drawnZone.stage.horizonY;
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
            const views = [current, incoming, fading?.view].filter((view): view is PlaceView => Boolean(view));
            const groundTexture = current?.ground[0]?.texture;
            const groundHeight = height * (current?.zone.continuousScene?.groundHeightFrac ?? 0.24);
            const groundWidth = groundTexture
              ? groundTexture.width * (groundHeight / Math.max(1, groundTexture.height))
              : width;
            const segmentIndex = Math.floor((displayedDistance * (width / 1_600)) / Math.max(1, groundWidth));
            const placeSprites = views.flatMap((view) => [view.sky, view.city, ...view.ground, view.foreground, view.night.sprite]
              .filter((sprite): sprite is PixiSprite => Boolean(sprite)));
            const visibleObjects = placeSprites.filter((sprite) => sprite.visible && sprite.parent?.visible !== false).length
              + groundLife.filter((item) => item.visible).length
              + motes.length + [...Object.values(shadows), ...walkerShadows].filter((shadow) => shadow.visible).length;
            const textureBytes = views.reduce((total, view) => total + view.bytes, 0);
            // Test-observable inventory of every texture the world holds on the
            // stage. Assets.load stamps the resolved URL onto the texture label;
            // textures built in the browser (a canvas, a render target) have no
            // URL, so they are recorded by size instead.
            const drawnTextures = new Set<string>();
            const collectTextures = (node: PixiContainer) => {
              // Only what is actually on screen. A hidden sprite that is waiting
              // for its texture is not something the world is drawing.
              if (!node.visible) return;
              if (node instanceof Sprite) {
                const texture = node.texture;
                if (texture !== Texture.EMPTY) {
                  drawnTextures.add(
                    texture.label || texture.source.label || `generated:${texture.width}x${texture.height}`,
                  );
                }
              }
              for (const child of node.children) collectTextures(child as PixiContainer);
            };
            collectTextures(app.stage);
            element.dataset.sceneTextures = [...drawnTextures].sort().join(" ");
            element.dataset.scenePlacesLoaded = String(views.length);
            element.dataset.sceneTexturesHeld = String(cache.held().length);
            element.dataset.sceneTextureBytes = String(textureBytes);
            element.dataset.sceneVariant = current
              ? `${current.renditions.city.crop}-${current.renditions.city.width || current.city.texture.width}`
              : "none";
            element.dataset.sceneNextZoneId = incoming?.zone.id ?? "";
            element.dataset.sceneRetryAttempts = String(retries.get(plan.current)?.attempt ?? 0);
            const signatureZone = drawnZone.id;
            diagnosticsCallback.current({
              routeSeconds: displayedSeconds,
              distance: displayedDistance,
              zoneId: signatureZone,
              segmentIndex,
              segmentSignature: `${composedSegmentSignature(signatureZone, segmentIndex, [1])}:p${segmentVariant(signatureZone, segmentIndex, 0, 12)}`,
              fps: Math.round(1_000 / Math.max(1, average)),
              p95FrameMs: Math.round(p95 * 10) / 10,
              liveObjects: visibleObjects,
              pooledObjects: placeSprites.length + groundLife.length + motes.length + 2,
              estimatedTextureBytes: textureBytes + 128 * 128 * 4,
            });
          }
        });
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
