"use client";

import { useEffect, useRef } from "react";
import { publicAssetUrl } from "@/lib/assets/url";
import type { Texture as PixiTexture } from "pixi.js";
import type { CountryPack, RouteProp, RouteZone } from "@/lib/content/schema";
import { travelerMotionAt, type TravelerMotionSnapshot } from "@/lib/traveler/motion-clock";
import { PresentationClock } from "@/lib/traveler/presentation-clock";
import { actorLayout } from "@/lib/traveler/actor-layout";
import type { TravelerCommand } from "@/lib/traveler/types";
import { QUALITY_LIMITS } from "@/lib/world/quality-tier";
import { deterministicVariant, routePositionAt } from "@/lib/world/route-clock";
import { segmentVariant } from "@/lib/world/segment-sequencer";
import { composedSegmentSignature } from "@/lib/world/segment-sequencer";
import type { QualityTier, RouteRuntime, WorldCommand, WorldDiagnosticsSnapshot } from "@/lib/world/types";

type Props = {
  pack: CountryPack;
  routeSeconds: number;
  routeRuntime: RouteRuntime;
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

type RuntimeRefs = Pick<Props, "routeSeconds" | "routeRuntime" | "command" | "reducedMotion" | "travelerCommand">;

export function PixiScene({
  pack,
  routeSeconds,
  routeRuntime,
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
  const runtime = useRef<RuntimeRefs>({ routeSeconds, routeRuntime, command, reducedMotion, travelerCommand });
  const motionCallback = useRef(onMotionSample);
  const zoneCallback = useRef(onZoneChange);
  const diagnosticsCallback = useRef(onDiagnostics);

  useEffect(() => {
    runtime.current = { routeSeconds, routeRuntime, command, reducedMotion, travelerCommand };
    motionCallback.current=onMotionSample;
    zoneCallback.current = onZoneChange;
    diagnosticsCallback.current = onDiagnostics;
  }, [command, onDiagnostics, onZoneChange, reducedMotion, routeRuntime, routeSeconds, travelerCommand, onMotionSample]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined;

    async function mount() {
      const element = host.current;
      if (!element) return;
      try {
        const { Application, Assets, Container, Graphics, Sprite, Texture } = await import("pixi.js");
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
        app.ticker.maxFPS = limits.targetFps;
        app.canvas.setAttribute("aria-hidden", "true");
        element.appendChild(app.canvas);

        const camera = new Container();
        const sky = new Graphics();
        const layerRoot = new Container();
        const propRoot = new Container();
        const groundLifeRoot = new Container();
        const weatherRoot = new Container();
        camera.addChild(sky, layerRoot, propRoot, groundLifeRoot, weatherRoot);
        app.stage.addChild(camera);
        const clock = new PresentationClock();
        const groundRoot = new Container();
        camera.addChildAt(groundRoot, camera.children.indexOf(weatherRoot));
        let contactSprites: InstanceType<typeof Sprite>[] = [];
        let contactTexture: PixiTexture | null = null;

        // V3 country packs include a complete editorial fallback for every
        // zone. Use that coherent painting as the panorama instead of stacking
        // opaque horizontal crops, which exposed hard seams as their parallax
        // offsets diverged. Motion remains explicit through panorama travel,
        // the independently moving ground-life track and weather.
        const coherentPanorama = pack.schemaVersion === 3;

        type LayerPool = {
          speed: number;
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
        let ready = false;
        let estimatedTextureBytes = 0;
        let zoneFade = 1;

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

        const buildZone = async (zoneIndex: number) => {
          pendingZoneIndex = zoneIndex;
          const generation = ++buildGeneration;
          const zone = pack.route.zones[zoneIndex];
          const loaded = coherentPanorama
            ? [{
              layer: { id: "coherent-panorama", speed: 0.055, y: 0, height: 1, segments: [] },
              textures: [await Assets.load<PixiTexture>(publicAssetUrl(zone.fallbackUrl))],
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

          const groundUrl = zone.layers.find(layer => layer.id === "ground")?.segments[0]?.url;
          let nextContact: PixiTexture | null = null;
          if (groundUrl) {
            try {
              const source = new Image();source.crossOrigin="anonymous";source.src=publicAssetUrl(groundUrl);await source.decode();
              const canvas=document.createElement("canvas");canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
              const ctx=canvas.getContext("2d")!;ctx.drawImage(source,0,0);
              ctx.globalCompositeOperation="destination-in";
              const vertical=ctx.createLinearGradient(0,0,0,canvas.height);vertical.addColorStop(0,"transparent");vertical.addColorStop(0.45,"white");vertical.addColorStop(1,"white");
              ctx.fillStyle=vertical;ctx.fillRect(0,0,canvas.width,canvas.height);
              const edge=ctx.createLinearGradient(0,0,canvas.width,0);edge.addColorStop(0,"transparent");edge.addColorStop(0.12,"white");edge.addColorStop(0.88,"white");edge.addColorStop(1,"transparent");
              ctx.fillStyle=edge;ctx.fillRect(0,0,canvas.width,canvas.height);
              nextContact=Texture.from(canvas);
            } catch { /* The approved painting remains visible if the optional contact layer fails. */ }
          }
          if (disposed || generation !== buildGeneration) { nextContact?.destroy(true); return; }
          groundRoot.removeChildren().forEach(child=>child.destroy());contactTexture?.destroy(true);
          contactTexture=nextContact;
          contactSprites=nextContact ? Array.from({length:5},()=>{const sprite=new Sprite(nextContact!);groundRoot.addChild(sprite);return sprite;}) : [];

          layerRoot.removeChildren().forEach((child) => child.destroy());
          propRoot.removeChildren().forEach((child) => child.destroy());
          groundLifeRoot.removeChildren().forEach((child) => child.destroy());
          weatherRoot.removeChildren().forEach((child) => child.destroy());
          let sequenceLayerIndex = 0;
          pools = loaded.map(({ layer, textures }, layerIndex) => {
            const container = new Container();
            layerRoot.addChild(container);
            const sprites = Array.from({ length: coherentPanorama ? 1 : 6 }, () => {
              const sprite = new Sprite(textures[0]);
              container.addChild(sprite);
              return sprite;
            });
            const pool = {
              speed: layer.speed,
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
            groundLifeRoot.addChild(detail);
            return detail;
          });
          motes = Array.from({ length: limits.motes }, (_, index) => {
            const mote = new Graphics();
            mote.circle(0, 0, 1 + (index % 3) * 0.7).fill({ color: 0xffe4a1, alpha: 0.3 });
            weatherRoot.addChild(mote);
            return mote;
          });
          activeZone = zone;
          activeZoneIndex = zoneIndex;
          pendingZoneIndex = -1;
          zoneFade = ready ? 0 : 1;
          sky.clear().rect(0, 0, app.screen.width, app.screen.height).fill(zone.lighting.skyTop);
          layerRoot.alpha = zoneFade;
          propRoot.alpha = zoneFade;
          groundLifeRoot.alpha = zoneFade;
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

        let displayedSeconds = runtime.current.routeSeconds;
        let elapsed = 0;
        let lastTickAt = performance.now();
        let lastDiagnosticAt = 0;
        let lastMotionAt=0;
        const frameSamples: number[] = [];
        app.ticker.add(() => {
          if (document.hidden) return;
          const state = runtime.current;
          const tickAt = performance.now();
          const wallDeltaMs = Math.min(500, Math.max(0, tickAt - lastTickAt));
          lastTickAt = tickAt;
          const deltaSeconds = wallDeltaMs / 1_000;
          elapsed += wallDeltaMs;
          frameSamples.push(wallDeltaMs);
          if (frameSamples.length > 180) frameSamples.shift();
          clock.accept(state.routeRuntime, state.travelerCommand?.presenceTtlMs ?? 50_000, tickAt);
          const sample = clock.sample(tickAt);
          const motion = travelerMotionAt(pack, sample.rawSeconds);
          if(tickAt-lastMotionAt>=100) {lastMotionAt=tickAt;motionCallback.current?.({assetVersion:pack.assetVersion,motion});}
          displayedSeconds = motion.routeSeconds;

          const position = routePositionAt(pack, displayedSeconds);
          const zoneDistance = position.zoneElapsedSeconds * pack.route.worldUnitsPerSecond;
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

          const width = app.screen.width;
          const height = app.screen.height;
          const layout=actorLayout(width,height);
          const baseline=height-layout.bottom;
          const groundPixels=motion.distanceMetres*(layout.height/1.78);
          element.dataset.gaitPhase=String(motion.cyclePhase);
          element.dataset.characterState=sample.traveling ? motion.action?.state ?? "walk" : "idle";
          element.dataset.actionReview=String(Boolean(state.travelerCommand?.actionReview&&state.travelerCommand.actionReview.action!=="auto"));
          element.dataset.groundPixels=String(groundPixels);
          if (contactTexture) {
            const stripHeight=Math.max(100,height*0.19);
            const stripScale=stripHeight/contactTexture.height;
            const span=contactTexture.width*stripScale;
            const pitch=span*0.86;
            const offset=state.reducedMotion?0:groundPixels;
            const first=Math.floor(offset/pitch)-1;
            contactSprites.forEach((sprite,index)=>{
              sprite.scale.set(stripScale);sprite.x=(first+index)*pitch-offset;
              sprite.y=baseline-stripHeight*0.7;sprite.visible=sprite.x<width&&sprite.x+span>0;
            });
          }
          camera.pivot.set(width / 2, height / 2);
          camera.position.set(width / 2, height / 2);
          camera.scale.set(1);
          zoneFade = Math.min(1, zoneFade + deltaSeconds * 2.4);
          layerRoot.alpha = zoneFade;
          propRoot.alpha = zoneFade * (0.72 + state.command.backgroundLife * 0.28);
          groundLifeRoot.alpha = zoneFade * (0.75 + state.command.backgroundLife * 0.25);
          weatherRoot.alpha = 0.5 + state.command.backgroundLife * 0.5;
          for (const pool of pools) {
            if (pool.panorama) {
              const sprite = pool.sprites[0];
              const texture = pool.textures[0];
              const coverScale = Math.max(width / Math.max(1, texture.width), height / Math.max(1, texture.height));
              const scale = coverScale * 1.1;
              const renderedWidth = texture.width * scale;
              const renderedHeight = texture.height * scale;
              const progress = state.reducedMotion ? 0.5 : Math.min(1, Math.max(0, position.zoneElapsedSeconds / activeZone.durationActiveSeconds));
              sprite.texture = texture;
              sprite.scale.set(scale);
              sprite.x = -(renderedWidth - width) * progress;
              sprite.y = (height - renderedHeight) / 2;
              sprite.visible = true;
              continue;
            }
            const targetHeight = height * pool.height;
            const sampleTexture = pool.textures[0];
            const scale = targetHeight / Math.max(1, sampleTexture.height);
            const segmentWidth = Math.max(180, sampleTexture.width * scale);
            const cameraPixels = zoneDistance * pool.speed * (width / 1_600);
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

          const groundCamera = state.reducedMotion ? 0 : groundPixels;
          const groundSpacing = width < 500 ? 170 : 240;
          const firstGround = Math.floor(groundCamera / groundSpacing) - 2;
          for (let index = 0; index < groundLife.length; index += 1) {
            const detail = groundLife[index];
            const streamIndex = firstGround + index;
            const jitter = deterministicVariant(`${activeZone.id}:ground-life`, streamIndex, 95);
            detail.x = streamIndex * groundSpacing + jitter - groundCamera;
            detail.y = height * (0.845 + (index % 3) * 0.018);
            detail.scale.set((0.75 + (index % 4) * 0.12) * height / 900);
            detail.visible = detail.x > -100 && detail.x < width + 100;
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
            mote.x = ((index * 173 + elapsed * (0.006 + (index % 4) * 0.002)) % (width + 80)) - 40;
            mote.y =
              70 +
              ((index * 97 + Math.sin(elapsed * 0.0007 + index) * 18) %
                Math.max(100, height * 0.62));
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
            const segmentIndex = Math.floor((position.distance * (width / 1_600)) / Math.max(1, groundWidth));
            const visibleObjects = pools.flatMap((pool) => pool.sprites).filter((sprite) => sprite.visible).length
              + props.filter((item) => item.display.visible).length
              + groundLife.filter((item) => item.visible).length
              + motes.length;
            diagnosticsCallback.current({
              routeSeconds: displayedSeconds,
              distance: position.distance,
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
              pooledObjects: pools.reduce((total, pool) => total + pool.sprites.length, 0) + props.length + groundLife.length + motes.length,
              estimatedTextureBytes,
            });
          }
        });

        const initialZoneIndex = routePositionAt(pack, displayedSeconds).zoneIndex;
        const initialNextZone = pack.route.zones[(initialZoneIndex + 1) % pack.route.zones.length];
        void Assets.backgroundLoad(zoneAssetUrls(initialNextZone)).catch(() => undefined);
        await buildZone(initialZoneIndex);
        resize();
        cleanup = () => {
          observer.disconnect();
          contactTexture?.destroy(true);
          app.destroy(true, { children: true });
        };
      } catch {
        onFailure();
      }
    }

    void mount();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [onFailure, onReady, pack, qualityTier]);

  return <div className="pixi-scene" ref={host} aria-hidden="true" />;
}
