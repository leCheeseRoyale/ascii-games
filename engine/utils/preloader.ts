/**
 * Asset preloader — bulk-load images, audio, text, and JSON with progress tracking.
 *
 * Usage:
 *   const result = await preloadAssets([
 *     { type: 'image', url: '/hero.png', id: 'hero' },
 *     { type: 'audio', url: '/bgm.mp3', id: 'music' },
 *     { type: 'json',  url: '/levels.json', id: 'levels' },
 *     { type: 'text',  url: '/story.txt', id: 'story' },
 *   ], {
 *     onProgress: (loaded, total) => console.log(`${loaded}/${total}`),
 *     concurrency: 4,
 *     timeout: 10000,
 *   })
 *
 *   if (result.success) {
 *     const hero = result.assets.hero       // HTMLImageElement
 *     const levels = result.assets.levels   // parsed JSON
 *   }
 */

import { loadImage } from "../render/image-loader";

/** An asset to preload. Type determines how it's loaded. */
export type PreloadAsset =
  | { type: "image"; url: string; id?: string }
  | { type: "audio"; url: string; id?: string }
  | { type: "text"; url: string; id?: string }
  | { type: "json"; url: string; id?: string };

export interface PreloadResult {
  /** Whether all assets loaded successfully. */
  success: boolean;
  /** Loaded assets keyed by id (or url if no id). */
  // biome-ignore lint/suspicious/noExplicitAny: asset types are heterogeneous by design
  assets: Record<string, any>;
  /** Assets that failed to load, with error message. */
  failures: Record<string, string>;
  /** Total time in ms. */
  duration: number;
}

export interface PreloadOptions {
  /** Called on each asset load (success or failure). */
  onProgress?: (loaded: number, total: number, asset: PreloadAsset) => void;
  /** Called when loading completes (success or partial failure). */
  onComplete?: (result: PreloadResult) => void;
  /** Maximum concurrent loads. Default 4. */
  concurrency?: number;
  /** Timeout per asset in ms. Default 10000. */
  timeout?: number;
  /** Continue on asset failure? Default true (returns partial success). */
  continueOnError?: boolean;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: cached asset types vary by loader
const assetCache = new Map<string, any>();

/** Clear all cached assets (frees memory). */
export function clearAssetCache(): void {
  assetCache.clear();
}

/** Get a previously-loaded asset by id. */
// biome-ignore lint/suspicious/noExplicitAny: caller knows their asset type
export function getAsset<T = any>(id: string): T | undefined {
  return assetCache.get(id) as T | undefined;
}

// ---------------------------------------------------------------------------
// Individual loaders
// ---------------------------------------------------------------------------

/** Load an audio element and wait for it to be playable. */
function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const onReady = () => {
      cleanup();
      resolve(audio);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio: ${url}`));
    };
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("canplaythrough", onReady);
    audio.addEventListener("error", onError);
    audio.preload = "auto";
    audio.src = url;
  });
}

async function loadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load text: ${url} (${res.status})`);
  return res.text();
}

// biome-ignore lint/suspicious/noExplicitAny: JSON parsing returns unknown shape
async function loadJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load JSON: ${url} (${res.status})`);
  return res.json();
}

/** Dispatch to the correct loader based on asset type. */
// biome-ignore lint/suspicious/noExplicitAny: return type depends on asset type
function loadAsset(asset: PreloadAsset): Promise<any> {
  switch (asset.type) {
    case "image":
      return loadImage(asset.url);
    case "audio":
      return loadAudio(asset.url);
    case "text":
      return loadText(asset.url);
    case "json":
      return loadJson(asset.url);
  }
}

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms: ${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Preload a batch of assets with controlled concurrency and progress tracking.
 * Loaded assets are cached by id (or url if no id) and retrievable via `getAsset`.
 */
export function preloadAssets(
  assets: PreloadAsset[],
  opts: PreloadOptions = {},
): Promise<PreloadResult> {
  const { onProgress, onComplete, concurrency = 4, timeout = 10000, continueOnError = true } = opts;

  const start = Date.now();

  // Empty list — resolve immediately.
  if (assets.length === 0) {
    const result: PreloadResult = {
      success: true,
      assets: {},
      failures: {},
      duration: 0,
    };
    onComplete?.(result);
    return Promise.resolve(result);
  }

  return new Promise<PreloadResult>((resolve, reject) => {
    // biome-ignore lint/suspicious/noExplicitAny: heterogeneous asset types
    const loaded: Record<string, any> = {};
    const failures: Record<string, string> = {};
    let loadedCount = 0;
    let nextIndex = 0;
    let active = 0;
    let rejected = false;

    const finish = () => {
      const duration = Date.now() - start;
      const success = Object.keys(failures).length === 0;
      const result: PreloadResult = { success, assets: loaded, failures, duration };
      onComplete?.(result);
      resolve(result);
    };

    const startNext = () => {
      if (rejected) return;

      // All assets dispatched and none active — done.
      if (nextIndex >= assets.length && active === 0) {
        finish();
        return;
      }

      // Dispatch up to concurrency.
      while (active < concurrency && nextIndex < assets.length && !rejected) {
        const asset = assets[nextIndex];
        if (!asset) break;
        nextIndex++;
        active++;
        const key = asset.id ?? asset.url;

        withTimeout(loadAsset(asset), timeout, key).then(
          (value) => {
            if (rejected) return;
            loaded[key] = value;
            assetCache.set(key, value);
            loadedCount++;
            active--;
            onProgress?.(loadedCount, assets.length, asset);
            startNext();
          },
          (err: Error) => {
            if (rejected) return;
            const message = err.message ?? String(err);

            if (!continueOnError) {
              rejected = true;
              active--;
              reject(err);
              return;
            }

            failures[key] = message;
            loadedCount++;
            active--;
            onProgress?.(loadedCount, assets.length, asset);
            startNext();
          },
        );
      }
    };

    startNext();
  });
}
