/**
 * Global test preload — runs before every test file.
 * Provides a minimal localStorage stub for storage tests.
 */
import { beforeEach } from "bun:test";

const store = new Map<string, string>();

const localStorageStub: Storage = {
  getItem(key: string): string | null {
    return store.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    store.set(key, value);
  },
  removeItem(key: string): void {
    store.delete(key);
  },
  clear(): void {
    store.clear();
  },
  get length(): number {
    return store.size;
  },
  key(index: number): string | null {
    const keys = [...store.keys()];
    return keys[index] ?? null;
  },
};

globalThis.localStorage = localStorageStub;

// Stub AudioContext so zzfx (imported via @engine) doesn't crash on load.
// Real playback is still impossible under bun:test, but templates and engine
// modules can now be imported without blowing up at module init.
// The stub must cover the Web Audio API surface used by zzfx: createBuffer,
// createBufferSource, createGain, StereoPannerNode, connect chains.
if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === "undefined") {
  /** A connectable audio node stub — connect() returns the target for chaining. */
  const audioNodeStub = () => ({
    connect(target?: Record<string, unknown>) {
      return target ?? audioNodeStub();
    },
  });

  class AudioContextStub {
    readonly destination = audioNodeStub();
    readonly sampleRate = 44100;
    readonly currentTime = 0;
    createBufferSource(): Record<string, unknown> {
      return {
        buffer: null,
        playbackRate: { value: 1 },
        loop: false,
        connect(target?: Record<string, unknown>) {
          return target ?? audioNodeStub();
        },
        start() {},
        stop() {},
        onended: null,
      };
    }
    createBuffer(_ch: number, len: number, _sr: number): Record<string, unknown> {
      return { getChannelData: () => new Float32Array(len || 1) };
    }
    createGain(): Record<string, unknown> {
      return { gain: { value: 1 }, ...audioNodeStub() };
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  (globalThis as { AudioContext: unknown }).AudioContext = AudioContextStub;

  // StereoPannerNode is used directly via `new StereoPannerNode(ctx, {pan})` in zzfx.
  if (typeof (globalThis as { StereoPannerNode?: unknown }).StereoPannerNode === "undefined") {
    (globalThis as { StereoPannerNode: unknown }).StereoPannerNode = class StereoPannerNodeStub {
      pan = { value: 0 };
      constructor(_ctx: unknown, opts?: { pan?: number }) {
        if (opts?.pan !== undefined) this.pan.value = opts.pan;
      }
      connect(target?: Record<string, unknown>) {
        return target ?? audioNodeStub();
      }
    };
  }
}

// Stub window for engine modules that attach listeners at import time (Keyboard,
// Gamepad, etc.). Tests that exercise those modules directly still mock their own
// pieces; this is just "enough" to make imports succeed.
if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  (globalThis as { window: unknown }).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
  };
}

beforeEach(() => {
  store.clear();
});
