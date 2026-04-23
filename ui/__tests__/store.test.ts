/**
 * Tests for ui/store.ts — extendStore, typedStore, and HMR re-extension.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { _resetExtension, extendStore, type StoreSlice, useStore } from "../store";

/** Shorthand — get the store snapshot as a loose record for dynamic key access. */
function snap(): Record<string, unknown> {
  return useStore.getState() as unknown as Record<string, unknown>;
}

beforeEach(() => {
  _resetExtension();
});

describe("extendStore", () => {
  test("merges initialState into the store", () => {
    const slice: StoreSlice<{ coins: number }> = {
      initialState: { coins: 50 },
    };
    extendStore(slice);
    expect(snap().coins).toBe(50);
  });

  test("registers actions from the slice", () => {
    const slice: StoreSlice<{ coins: number }> = {
      initialState: { coins: 0 },
      actions: (set) => ({
        addCoin: () => set((s) => ({ coins: (s as unknown as { coins: number }).coins + 1 })),
      }),
    };
    extendStore(slice);
    expect(typeof snap().addCoin).toBe("function");
  });

  test("idempotent — same slice re-applied is a no-op", () => {
    const slice: StoreSlice<{ coins: number }> = {
      initialState: { coins: 10 },
    };
    extendStore(slice);
    // Mutate coins to verify re-apply doesn't overwrite
    useStore.setState({ coins: 99 } as unknown as Partial<Record<string, unknown>>);
    extendStore(slice);
    expect(snap().coins).toBe(99);
  });

  test("different slice replaces state and actions (bug C14)", () => {
    // Slice A
    const sliceA: StoreSlice<{ gems: number }> = {
      initialState: { gems: 5 },
      actions: (set) => ({
        addGem: () => set((s) => ({ gems: (s as unknown as { gems: number }).gems + 1 })),
      }),
    };
    extendStore(sliceA);
    expect(snap().gems).toBe(5);
    expect(typeof snap().addGem).toBe("function");

    // Slice B — different initialState and actions
    const sliceB: StoreSlice<{ stars: number }> = {
      initialState: { stars: 100 },
      actions: (set) => ({
        addStar: () => set((s) => ({ stars: (s as unknown as { stars: number }).stars + 1 })),
      }),
    };
    extendStore(sliceB);
    // Slice B's state is applied
    expect(snap().stars).toBe(100);
    // Slice B's actions are registered (this was the bug — they were skipped)
    expect(typeof snap().addStar).toBe("function");
    // Verify the action works
    (snap().addStar as () => void)();
    expect(snap().stars).toBe(101);
  });
});
