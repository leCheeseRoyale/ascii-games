import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { clearAssetCache, getAsset, type PreloadAsset, preloadAssets } from "../../utils/preloader";

// -----------------------------------------------------------------------------
// Fetch mock helpers
// -----------------------------------------------------------------------------

type FetchResponse = {
  ok: boolean;
  status?: number;
  body: string;
  delayMs?: number;
  reject?: boolean;
};

type FetchMockMap = Record<string, FetchResponse>;

const realFetch = globalThis.fetch;
const realImage = (globalThis as unknown as { Image?: unknown }).Image;
const realAudio = (globalThis as unknown as { Audio?: unknown }).Audio;

function installFetchMock(map: FetchMockMap) {
  const fn = mock(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const entry = map[url];
    if (!entry) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    if (entry.delayMs) {
      await new Promise((r) => setTimeout(r, entry.delayMs));
    }
    if (entry.reject) {
      throw new Error(`Network error: ${url}`);
    }
    return {
      ok: entry.ok,
      status: entry.status ?? (entry.ok ? 200 : 500),
      async text() {
        return entry.body;
      },
      async json() {
        return JSON.parse(entry.body);
      },
    } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

// -----------------------------------------------------------------------------
// Image / Audio mocks — simulate the load-then-fire-event pattern
// -----------------------------------------------------------------------------

type MockMediaConfig = {
  succeed: boolean;
  delayMs?: number;
};

type MediaConfigMap = Record<string, MockMediaConfig>;

function installImageMock(map: MediaConfigMap) {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      const config = map[value];
      if (!config) {
        setTimeout(() => this.onerror?.(), 0);
        return;
      }
      setTimeout(() => {
        if (config.succeed) this.onload?.();
        else this.onerror?.();
      }, config.delayMs ?? 0);
    }
  }
  (globalThis as unknown as { Image: unknown }).Image = MockImage;
}

function installAudioMock(map: MediaConfigMap) {
  class MockAudio {
    preload = "";
    private listeners = new Map<string, Array<() => void>>();
    private _src = "";
    addEventListener(type: string, fn: () => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type)!.push(fn);
    }
    removeEventListener(type: string, fn: () => void) {
      const arr = this.listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
    private fire(type: string) {
      const arr = this.listeners.get(type);
      if (arr) for (const fn of [...arr]) fn();
    }
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      const config = map[value];
      if (!config) {
        setTimeout(() => this.fire("error"), 0);
        return;
      }
      setTimeout(() => {
        if (config.succeed) this.fire("canplaythrough");
        else this.fire("error");
      }, config.delayMs ?? 0);
    }
  }
  (globalThis as unknown as { Audio: unknown }).Audio = MockAudio;
}

// -----------------------------------------------------------------------------
// Setup / teardown
// -----------------------------------------------------------------------------

beforeEach(() => {
  clearAssetCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realImage) (globalThis as unknown as { Image: unknown }).Image = realImage;
  else delete (globalThis as unknown as { Image?: unknown }).Image;
  if (realAudio) (globalThis as unknown as { Audio: unknown }).Audio = realAudio;
  else delete (globalThis as unknown as { Audio?: unknown }).Audio;
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("preloadAssets", () => {
  test("resolves immediately with empty list", async () => {
    const onComplete = mock(() => {});
    const result = await preloadAssets([], { onComplete });
    expect(result.success).toBe(true);
    expect(result.assets).toEqual({});
    expect(result.failures).toEqual({});
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("loads a single text asset via mocked fetch", async () => {
    installFetchMock({
      "/hello.txt": { ok: true, body: "Hello, world" },
    });
    const result = await preloadAssets([{ type: "text", url: "/hello.txt", id: "greeting" }]);
    expect(result.success).toBe(true);
    expect(result.assets.greeting).toBe("Hello, world");
    expect(result.failures).toEqual({});
  });

  test("loads a JSON asset and parses it", async () => {
    installFetchMock({
      "/levels.json": { ok: true, body: '{"level":3,"name":"forest"}' },
    });
    const result = await preloadAssets([{ type: "json", url: "/levels.json", id: "levels" }]);
    expect(result.success).toBe(true);
    expect(result.assets.levels).toEqual({ level: 3, name: "forest" });
  });

  test("uses url as fallback key when id is missing", async () => {
    installFetchMock({
      "/data.txt": { ok: true, body: "abc" },
    });
    const result = await preloadAssets([{ type: "text", url: "/data.txt" }]);
    expect(result.assets["/data.txt"]).toBe("abc");
  });

  test("calls onProgress for each asset in a batch", async () => {
    installFetchMock({
      "/a.txt": { ok: true, body: "A" },
      "/b.txt": { ok: true, body: "B" },
      "/c.txt": { ok: true, body: "C" },
    });
    const progress: Array<[number, number]> = [];
    const assets: PreloadAsset[] = [
      { type: "text", url: "/a.txt", id: "a" },
      { type: "text", url: "/b.txt", id: "b" },
      { type: "text", url: "/c.txt", id: "c" },
    ];
    const result = await preloadAssets(assets, {
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });
    expect(result.success).toBe(true);
    expect(progress.length).toBe(3);
    // loaded counts should be 1, 2, 3 in order; total always 3
    expect(progress.map((p) => p[0]).sort()).toEqual([1, 2, 3]);
    for (const [, total] of progress) expect(total).toBe(3);
  });

  test("fires onComplete exactly once at the end", async () => {
    installFetchMock({
      "/a.txt": { ok: true, body: "A" },
      "/b.txt": { ok: true, body: "B" },
    });
    const onComplete = mock(() => {});
    await preloadAssets(
      [
        { type: "text", url: "/a.txt", id: "a" },
        { type: "text", url: "/b.txt", id: "b" },
      ],
      { onComplete },
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("respects concurrency limit — only N loads active at once", async () => {
    let active = 0;
    let peak = 0;

    const fetchMock = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return {
        ok: true,
        status: 200,
        async text() {
          return `body-${url}`;
        },
      } as Response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const assets: PreloadAsset[] = Array.from({ length: 8 }, (_, i) => ({
      type: "text" as const,
      url: `/item-${i}.txt`,
      id: `item-${i}`,
    }));

    const result = await preloadAssets(assets, { concurrency: 2 });
    expect(result.success).toBe(true);
    expect(Object.keys(result.assets).length).toBe(8);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  test("timeout rejects a slow asset", async () => {
    installFetchMock({
      "/slow.txt": { ok: true, body: "slow", delayMs: 500 },
    });
    const result = await preloadAssets([{ type: "text", url: "/slow.txt", id: "slow" }], {
      timeout: 50,
      continueOnError: true,
    });
    expect(result.success).toBe(false);
    expect(result.failures.slow).toMatch(/Timeout/i);
    expect(result.assets.slow).toBeUndefined();
  });

  test("continueOnError: true returns partial success", async () => {
    installFetchMock({
      "/good.txt": { ok: true, body: "good" },
      "/bad.txt": { ok: false, status: 404, body: "" },
    });
    const result = await preloadAssets(
      [
        { type: "text", url: "/good.txt", id: "good" },
        { type: "text", url: "/bad.txt", id: "bad" },
      ],
      { continueOnError: true },
    );
    expect(result.success).toBe(false);
    expect(result.assets.good).toBe("good");
    expect(result.failures.bad).toBeDefined();
  });

  test("continueOnError: false rejects on first failure", async () => {
    installFetchMock({
      "/bad.txt": { ok: false, status: 500, body: "" },
    });
    await expect(
      preloadAssets([{ type: "text", url: "/bad.txt", id: "bad" }], {
        continueOnError: false,
      }),
    ).rejects.toThrow();
  });

  test("getAsset returns a cached asset after loading", async () => {
    installFetchMock({
      "/cache.txt": { ok: true, body: "cached-value" },
    });
    await preloadAssets([{ type: "text", url: "/cache.txt", id: "cache" }]);
    expect(getAsset<string>("cache")).toBe("cached-value");
  });

  test("clearAssetCache empties the cache", async () => {
    installFetchMock({
      "/x.txt": { ok: true, body: "x" },
    });
    await preloadAssets([{ type: "text", url: "/x.txt", id: "x" }]);
    expect(getAsset<string>("x")).toBe("x");
    clearAssetCache();
    expect(getAsset("x")).toBeUndefined();
  });

  test("records duration in the result", async () => {
    installFetchMock({
      "/a.txt": { ok: true, body: "A" },
    });
    const result = await preloadAssets([{ type: "text", url: "/a.txt", id: "a" }]);
    expect(typeof result.duration).toBe("number");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test("loads an image via mocked Image element", async () => {
    installImageMock({
      "/hero.png": { succeed: true },
    });
    const result = await preloadAssets([{ type: "image", url: "/hero.png", id: "hero" }]);
    expect(result.success).toBe(true);
    expect(result.assets.hero).toBeDefined();
  });

  test("loads audio via mocked Audio element", async () => {
    installAudioMock({
      "/bgm.mp3": { succeed: true },
    });
    const result = await preloadAssets([{ type: "audio", url: "/bgm.mp3", id: "music" }]);
    expect(result.success).toBe(true);
    expect(result.assets.music).toBeDefined();
  });

  test("mixed asset types load together", async () => {
    installFetchMock({
      "/story.txt": { ok: true, body: "once upon a time" },
      "/config.json": { ok: true, body: '{"difficulty":"hard"}' },
    });
    installImageMock({
      "/sprite.png": { succeed: true },
    });
    installAudioMock({
      "/song.mp3": { succeed: true },
    });

    const result = await preloadAssets([
      { type: "text", url: "/story.txt", id: "story" },
      { type: "json", url: "/config.json", id: "config" },
      { type: "image", url: "/sprite.png", id: "sprite" },
      { type: "audio", url: "/song.mp3", id: "song" },
    ]);

    expect(result.success).toBe(true);
    expect(result.assets.story).toBe("once upon a time");
    expect(result.assets.config).toEqual({ difficulty: "hard" });
    expect(result.assets.sprite).toBeDefined();
    expect(result.assets.song).toBeDefined();
  });
});
