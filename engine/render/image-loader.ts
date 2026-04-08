/**
 * Image loader with caching.
 *
 * Usage:
 *   const img = await engine.loadImage('/sprites/hero.png')
 *   engine.spawn({
 *     position: { x: 100, y: 100 },
 *     image: { image: img, width: 32, height: 32 },
 *   })
 *
 * Or preload multiple:
 *   await engine.preloadImages(['/bg.jpg', '/hero.png', '/enemy.png'])
 */

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** Load an image by URL. Returns cached if already loaded. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached) return Promise.resolve(cached);

  const inflight = pending.get(src);
  if (inflight) return inflight;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      pending.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  });

  pending.set(src, promise);
  return promise;
}

/** Preload multiple images in parallel. */
export function preloadImages(srcs: string[]): Promise<HTMLImageElement[]> {
  return Promise.all(srcs.map(loadImage));
}

/** Get a cached image synchronously. Returns null if not loaded yet. */
export function getCachedImage(src: string): HTMLImageElement | null {
  return cache.get(src) ?? null;
}

/** Clear the image cache. */
export function clearImageCache(): void {
  cache.clear();
}
