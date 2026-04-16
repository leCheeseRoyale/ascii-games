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
if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === "undefined") {
  class AudioContextStub {
    readonly destination = {};
    readonly sampleRate = 44100;
    readonly currentTime = 0;
    createBufferSource(): Record<string, unknown> {
      return { buffer: null, connect: () => {}, start: () => {}, onended: null };
    }
    createBuffer(_ch: number, _len: number, _sr: number): Record<string, unknown> {
      return { getChannelData: () => new Float32Array(0) };
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  (globalThis as { AudioContext: unknown }).AudioContext = AudioContextStub;
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
