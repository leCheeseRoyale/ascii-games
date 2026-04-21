/**
 * Seeded 2D simplex noise for terrain/cave density maps.
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

import { createNoise2D as createSimplex2D } from "simplex-noise";
import { GridMap } from "./grid";

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

/**
 * splitmix32 — returns a stateful RNG that yields sequential uint32 values.
 * Used to feed a deterministic random source into simplex-noise.
 */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z;
  };
}

/**
 * Create a seeded 2D simplex-noise function.
 * Returns values in [0, 1].
 */
export function createNoise2D(opts?: NoiseOptions): (x: number, y: number) => number {
  const seed = opts?.seed ?? Math.random() * 0xffffffff;
  const scale = opts?.scale ?? 0.1;
  const octaves = opts?.octaves ?? 1;
  const persistence = opts?.persistence ?? 0.5;

  const rng = splitmix32(seed);
  const simplex = createSimplex2D(() => rng() / 0xffffffff);

  return (x: number, y: number): number => {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxAmplitude = 0;

    for (let o = 0; o < octaves; o++) {
      value += simplex(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    // Normalize from [-1,1] to [0,1]
    return (value / maxAmplitude + 1) / 2;
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
