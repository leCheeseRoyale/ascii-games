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

import { create } from 'zustand'

export type GameScreen = 'menu' | 'playing' | 'paused' | 'gameOver'

export interface GameStore {
  // ── Game state (written by game loop) ──
  screen: GameScreen
  score: number
  highScore: number
  health: number
  maxHealth: number
  fps: number
  entityCount: number
  sceneName: string

  // ── Actions (called by game loop or UI) ──
  setScreen: (screen: GameScreen) => void
  setScore: (score: number) => void
  setHealth: (current: number, max: number) => void
  setDebugInfo: (fps: number, entityCount: number) => void
  setSceneName: (name: string) => void
  reset: () => void
}

const initialState = {
  screen: 'menu' as GameScreen,
  score: 0,
  highScore: 0,
  health: 100,
  maxHealth: 100,
  fps: 0,
  entityCount: 0,
  sceneName: '',
}

export const useStore = create<GameStore>((set, get) => ({
  ...initialState,

  setScreen: (screen) => set({ screen }),
  setScore: (score) => {
    const hs = Math.max(score, get().highScore)
    set({ score, highScore: hs })
  },
  setHealth: (current, max) => set({ health: current, maxHealth: max }),
  setDebugInfo: (fps, entityCount) => set({ fps, entityCount }),
  setSceneName: (sceneName) => set({ sceneName }),
  reset: () => set({ ...initialState, highScore: get().highScore }),
}))
