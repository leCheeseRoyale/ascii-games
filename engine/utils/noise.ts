/**
 * Lightweight 2D value noise for terrain/cave density maps.
 *
 * Usage:
 *   const noise = createNoise2D({ seed: 42, scale: 0.05, octaves: 3 })
 *   const value = noise(x, y) // [0, 1]
 *
 *   const grid = generateNoiseGrid(80, 40, {
 *     scale: 0.1,
 *     classify: v => v > 0.5 ? '#' : '.',
 *   })
 */

import { GridMap } from "./grid";
import { lerp } from "./math";

export interface NoiseOptions {
  /** RNG seed. Default Math.random() * 0xffffffff */
  seed?: number;
  /** Sampling frequency. Default 0.1 */
  scale?: number;
  /** Fractal octaves. Default 1 */
  octaves?: number;
  /** Amplitude decay per octave. Default 0.5 */
  persistence?: number;
}

/** Smoothstep: 3t^2 - 2t^3 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** xorshift32 — returns next state. */
function xorshift32(state: number): number {
  let s = state | 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return s >>> 0;
}

/** Build a 256-entry permutation table from a seed. */
function buildPerm(seed: number): Uint8Array {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed >>> 0;
  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    s = xorshift32(s);
    const j = s % (i + 1);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  return perm;
}

/** Deterministic lattice value at integer coords. Returns [0,1]. */
function hash(ix: number, iy: number, perm: Uint8Array): number {
  const idx = perm[(perm[ix & 255] + iy) & 255];
  return idx / 255;
}

/**
 * Create a seeded 2D value-noise function.
 * Returns values in [0, 1].
 */
export function createNoise2D(opts?: NoiseOptions): (x: number, y: number) => number {
  const seed = (opts?.seed ?? Math.random() * 0xffffffff) >>> 0;
  const scaleVal = opts?.scale ?? 0.1;
  const octaves = opts?.octaves ?? 1;
  const persistence = opts?.persistence ?? 0.5;

  const perm = buildPerm(seed);

  return (x: number, y: number): number => {
    let total = 0;
    let amplitude = 1;
    let frequency = scaleVal;
    let maxAmplitude = 0;

    for (let o = 0; o < octaves; o++) {
      const sx = x * frequency;
      const sy = y * frequency;

      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = smoothstep(sx - ix);
      const fy = smoothstep(sy - iy);

      const v00 = hash(ix, iy, perm);
      const v10 = hash(ix + 1, iy, perm);
      const v01 = hash(ix, iy + 1, perm);
      const v11 = hash(ix + 1, iy + 1, perm);

      const top = lerp(v00, v10, fx);
      const bot = lerp(v01, v11, fx);
      const val = lerp(top, bot, fy);

      total += val * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxAmplitude;
  };
}

/**
 * Generate a GridMap<string> by sampling noise and classifying each cell.
 */
export function generateNoiseGrid(
  cols: number,
  rows: number,
  opts: NoiseOptions & { classify: (value: number) => string },
): GridMap<string> {
  const noise = createNoise2D(opts);
  const grid = new GridMap<string>(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = noise(c, r);
      grid.set(c, r, opts.classify(v));
    }
  }
  return grid;
}
