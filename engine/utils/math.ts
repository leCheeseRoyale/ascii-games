/** Minimal math utilities. */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const len = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);
export const normalize = (v: Vec2): Vec2 => {
  const l = len(v);
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
export const rng = (min: number, max: number): number => Math.random() * (max - min) + min;
export const rngInt = (min: number, max: number): number => Math.floor(rng(min, max + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number): boolean => Math.random() < p;
