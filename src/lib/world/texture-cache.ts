/**
 * Reference-counted place textures. A texture the outgoing place and the incoming
 * place share is never destroyed, a released texture is unloaded one per frame so
 * freeing a city never stalls a single frame, and a failed load leaves nothing
 * behind so the next attempt really retries.
 */
export type TextureSource<T> = {
  load(url: string): Promise<T>;
  unload(url: string): void | Promise<void>;
};

type Entry<T> = { refs: number; promise: Promise<T> };

export class PlaceTextureCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private releasing: string[] = [];
  private disposed = false;

  constructor(private readonly source: TextureSource<T>) {}

  acquire(url: string): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Texture cache is disposed"));
    let entry = this.entries.get(url);
    if (!entry) {
      const created: Entry<T> = {
        refs: 0,
        promise: this.source.load(url).catch((error: unknown) => {
          if (this.entries.get(url) === created) this.entries.delete(url);
          throw error;
        }),
      };
      entry = created;
      this.entries.set(url, entry);
    }
    entry.refs += 1;
    this.releasing = this.releasing.filter((pending) => pending !== url);
    return entry.promise;
  }

  release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && !this.releasing.includes(url)) this.releasing.push(url);
  }

  /** Unloads at most one released texture. Call once per rendered frame. */
  drainOne(): string | null {
    while (this.releasing.length > 0) {
      const url = this.releasing.shift()!;
      const entry = this.entries.get(url);
      if (!entry || entry.refs > 0) continue;
      this.entries.delete(url);
      void entry.promise.then(() => this.source.unload(url), () => undefined);
      return url;
    }
    return null;
  }

  held(): string[] {
    return [...this.entries.keys()].sort();
  }

  pendingReleases(): number {
    return this.releasing.length;
  }

  /** The scene is gone, so every texture can be unloaded as soon as its load settles. */
  dispose(): string[] {
    if (this.disposed) return [];
    this.disposed = true;
    const entries = [...this.entries];
    this.entries.clear();
    this.releasing = [];
    for (const [url, entry] of entries) {
      void entry.promise.then(() => this.source.unload(url), () => undefined);
    }
    return entries.map(([url]) => url).sort();
  }
}

/** 2 s, 5 s, 15 s, then every 30 s: quick recovery from a blip, gentle on a real outage. */
export const TEXTURE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;

export function textureRetryDelayMs(attempt: number): number {
  const index = Math.min(TEXTURE_RETRY_DELAYS_MS.length - 1, Math.max(0, Math.floor(attempt)));
  return TEXTURE_RETRY_DELAYS_MS[index]!;
}
