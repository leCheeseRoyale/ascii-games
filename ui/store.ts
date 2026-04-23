/**
 * Zustand store — the ONLY bridge between game loop and React.
 *
 * Game loop writes: useStore.getState().setScore(10)
 * React reads:      const score = useStore(s => s.score)
 *
 * Rules:
 *   - Game loop uses getState() (no hooks outside React)
 *   - React uses useStore() hook (reactive)
 *   - Never import React stuff in engine/ or game/
 */

import { create, type StoreApi, type UseBoundStore } from "zustand";

export type GameScreen = string;

// ── Store extension types ──────────────────────────────────────

/** Define a typed store slice for game-specific state. */
export interface StoreSlice<T extends Record<string, unknown>> {
  /** Initial values for your custom state fields. */
  initialState: T;
  /** Optional action creators. Receives zustand set/get typed to your slice + GameStore. */
  actions?: (
    set: (
      partial: Partial<GameStore & T> | ((state: GameStore & T) => Partial<GameStore & T>),
    ) => void,
    get: () => GameStore & T,
    // biome-ignore lint/suspicious/noExplicitAny: zustand typing limitation — action args can't be statically narrowed
  ) => Record<string, (...args: any[]) => void>;
}

export interface GameStore {
  // ── Game state (written by game loop) ──
  screen: GameScreen;
  score: number;
  highScore: number;
  health: number;
  maxHealth: number;
  fps: number;
  entityCount: number;
  sceneName: string;

  // ── Game extension point ──
  gameState: Record<string, unknown>;
  setGameState: (key: string, value: unknown) => void;
  getGameState: <T>(key: string) => T | undefined;

  // ── Actions (called by game loop or UI) ──
  setScreen: (screen: GameScreen) => void;
  setScore: (score: number) => void;
  setHealth: (current: number, max: number) => void;
  setDebugInfo: (fps: number, entityCount: number) => void;
  setSceneName: (name: string) => void;
  reset: () => void;
}

const initialState = {
  screen: "menu" as GameScreen,
  score: 0,
  highScore: 0,
  health: 100,
  maxHealth: 100,
  fps: 0,
  entityCount: 0,
  sceneName: "",
  gameState: {} as Record<string, unknown>,
};

export const useStore = create<GameStore>((set, get) => ({
  ...initialState,

  setGameState: (key, value) =>
    set((state) => ({
      gameState: { ...state.gameState, [key]: value },
    })),
  getGameState: <T>(key: string) => get().gameState[key] as T | undefined,

  setScreen: (screen) => set({ screen }),
  setScore: (score) => {
    const hs = Math.max(score, get().highScore);
    set({ score, highScore: hs });
  },
  setHealth: (current, max) => set({ health: current, maxHealth: max }),
  setDebugInfo: (fps, entityCount) => set({ fps, entityCount }),
  setSceneName: (sceneName) => set({ sceneName }),
  reset: () => set({ ...initialState, ..._extensionInitialState, highScore: get().highScore }),
}));

// ── Store extension API ────────────────────────────────────────

let _extensionInitialState: Record<string, unknown> = {};

/**
 * Merge game-specific state and actions into the store.
 * Called automatically during setupGame() if a `store` field is returned.
 * Idempotent — safe to call multiple times (e.g., during HMR).
 * On HMR re-mount the same slice is re-applied (state refreshed, actions skipped).
 * A different slice fully re-applies both state and actions.
 */
export function extendStore<T extends Record<string, unknown>>(slice: StoreSlice<T>): void {
  if (JSON.stringify(slice.initialState) === JSON.stringify(_extensionInitialState)) return;

  _extensionInitialState = { ...slice.initialState };
  useStore.setState(slice.initialState as Partial<GameStore>);

  if (slice.actions) {
    const actions = slice.actions(
      // biome-ignore lint/suspicious/noExplicitAny: zustand typing limitation — setState generic doesn't narrow to extended slice type
      useStore.setState as any,
      useStore.getState as () => GameStore & T,
    );
    useStore.setState(actions as Partial<GameStore>);
  }
}

/** @internal Reset extension state — for tests only. */
export function _resetExtension(): void {
  _extensionInitialState = {};
  useStore.setState(initialState);
}

/**
 * Get a typed version of the store that includes your game-specific state.
 *
 * Usage:
 *   const useGameStore = typedStore<MyGameState>()
 *   useGameStore.getState().myField  // typed!
 *   const val = useGameStore(s => s.myField)  // typed in React!
 */
export function typedStore<T>(): UseBoundStore<StoreApi<GameStore & T>> {
  return useStore as unknown as UseBoundStore<StoreApi<GameStore & T>>;
}
