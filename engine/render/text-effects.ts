/**
 * Text Effects — per-character visual transforms for canvas text.
 *
 * Effects are composable functions applied during rendering.
 * Each effect takes (charIndex, totalChars, time) and returns a CharTransform.
 *
 * Usage:
 *   import { wave, rainbow, compose } from '@engine'
 *
 *   // On an entity
 *   engine.spawn({
 *     position: { x: 100, y: 200 },
 *     ascii: { char: 'LEGENDARY!', font: FONTS.large, color: '#ff0' },
 *     textEffect: { fn: compose(wave(5), rainbow()) },
 *   })
 *
 *   // In canvas UI
 *   engine.ui.effectText(x, y, 'Wavy text', wave(), { color: '#0f8' })
 */

import type { CharTransform, TextEffectFn } from "@shared/types";

const ZERO: CharTransform = { dx: 0, dy: 0 };

// ── Effect factories ────────────────────────────────────────────

/** Sinusoidal vertical wave — text undulates like water. */
export function wave(amplitude = 4, frequency = 0.3, speed = 3): TextEffectFn {
  return (i, _n, t) => ({
    dx: 0,
    dy: Math.sin(t * speed + i * frequency) * amplitude,
  });
}

/** Horizontal sway — text sways side to side. */
export function sway(amplitude = 3, frequency = 0.4, speed = 2): TextEffectFn {
  return (i, _n, t) => ({
    dx: Math.sin(t * speed + i * frequency) * amplitude,
    dy: 0,
  });
}

/** Random per-character jitter — frantic/unstable text. */
export function shake(magnitude = 2, speed = 15): TextEffectFn {
  return (i, _n, t) => {
    const frame = Math.floor(t * speed);
    const sx = Math.sin(i * 7919 + frame * 104729) * 43758.5453;
    const sy = Math.sin(i * 7919 + frame * 104729 + 1) * 43758.5453;
    return {
      dx: ((sx % 1) * 2 - 1) * magnitude,
      dy: ((sy % 1) * 2 - 1) * magnitude,
    };
  };
}

/** Cycling rainbow hue per character. */
export function rainbow(speed = 1, spread = 25): TextEffectFn {
  return (i, _n, t) => ({
    dx: 0,
    dy: 0,
    color: `hsl(${(t * speed * 60 + i * spread) % 360}, 80%, 65%)`,
  });
}

/** Random character substitution + offset — corrupted/glitched text. */
export function glitch(intensity = 0.06, chars = "!@#$%^&*█▓░▒╬╠╣"): TextEffectFn {
  return (i, _n, t) => {
    const frame = Math.floor(t * 8);
    const seed = Math.sin(i * 13.7 + frame * 71.3) * 43758.5453;
    const r = Math.abs(seed % 1);
    if (r < intensity) {
      const ci = Math.abs(Math.floor(Math.sin(seed * 2.1) * chars.length)) % chars.length;
      return {
        dx: (Math.sin(seed * 3.7) % 1) * 4,
        dy: (Math.sin(seed * 5.3) % 1) * 2,
        char: chars[ci],
      };
    }
    return ZERO;
  };
}

/** Pulsing opacity — text breathes. */
export function pulse(speed = 2, min = 0.3): TextEffectFn {
  return (_i, _n, t) => ({
    dx: 0,
    dy: 0,
    opacity: min + (1 - min) * (0.5 + 0.5 * Math.sin(t * speed * Math.PI * 2)),
  });
}

/** Pulsing scale — text pumps in and out. */
export function throb(speed = 2, min = 0.9, max = 1.1): TextEffectFn {
  return (_i, _n, t) => ({
    dx: 0,
    dy: 0,
    scale: min + (max - min) * (0.5 + 0.5 * Math.sin(t * speed * Math.PI * 2)),
  });
}

/** Staggered reveal from left to right — cinematic entrance. */
export function fadeIn(charDelay = 0.04, fadeDuration = 0.3): TextEffectFn {
  return (i, _n, t) => {
    const start = i * charDelay;
    const progress = Math.min(1, Math.max(0, (t - start) / fadeDuration));
    const eased = 1 - (1 - progress) ** 3; // ease-out cubic
    return {
      dx: 0,
      dy: (1 - eased) * -8,
      opacity: eased,
    };
  };
}

/** Characters pop up from below with overshoot. */
export function popIn(charDelay = 0.03, duration = 0.25): TextEffectFn {
  return (i, _n, t) => {
    const start = i * charDelay;
    const progress = Math.min(1, Math.max(0, (t - start) / duration));
    // Overshoot ease (back ease out)
    const s = 1.7;
    const eased = progress < 1 ? 1 + (progress - 1) ** 2 * ((s + 1) * (progress - 1) + s) : 1;
    return {
      dx: 0,
      dy: (1 - eased) * 20,
      opacity: Math.min(1, progress * 3),
      scale: 0.5 + eased * 0.5,
    };
  };
}

/** Gentle floating bob — ambient/magical text. */
export function float(amplitude = 3, speed = 1, spread = 0.5): TextEffectFn {
  return (i, _n, t) => ({
    dx: 0,
    dy: Math.sin(t * speed + i * spread) * amplitude,
  });
}

/** Random opacity drops — like a dying neon sign. */
export function flicker(speed = 10, dropChance = 0.3): TextEffectFn {
  return (_i, _n, t) => {
    const frame = Math.floor(t * speed);
    const r = Math.abs(Math.sin(frame * 12345.6789) % 1);
    return {
      dx: 0,
      dy: 0,
      opacity: r < dropChance ? 0.15 + Math.abs(Math.sin(frame * 9.1) % 1) * 0.3 : 1,
    };
  };
}

/** Spiral inward — characters orbit toward their position. */
export function spiral(radius = 30, speed = 3, decayTime = 1): TextEffectFn {
  return (i, n, t) => {
    const decay = Math.max(0, 1 - t / decayTime);
    const angle = t * speed + (i / Math.max(1, n)) * Math.PI * 2;
    return {
      dx: Math.cos(angle) * radius * decay,
      dy: Math.sin(angle) * radius * decay,
      opacity: 1 - decay * 0.5,
    };
  };
}

/** Scatter — characters fly in from random directions. */
export function scatter(distance = 100, duration = 0.6): TextEffectFn {
  // Pre-generate random angles per character slot (deterministic from index)
  return (i, _n, t) => {
    const progress = Math.min(1, t / duration);
    const eased = 1 - (1 - progress) ** 3;
    // Deterministic random direction per character
    const angle = (i * 2654435761) % (Math.PI * 2);
    const d = distance * (1 - eased);
    return {
      dx: Math.cos(angle) * d,
      dy: Math.sin(angle) * d,
      opacity: eased,
    };
  };
}

// ── Composition ─────────────────────────────────────────────────

/** Compose multiple effects. Offsets add, colors/opacity/scale multiply/override. */
export function compose(...effects: TextEffectFn[]): TextEffectFn {
  if (effects.length === 1) return effects[0];
  return (i, n, t) => {
    let dx = 0;
    let dy = 0;
    let color: string | undefined;
    let opacity: number | undefined;
    let scale: number | undefined;
    let char: string | undefined;

    for (const fx of effects) {
      const r = fx(i, n, t);
      dx += r.dx;
      dy += r.dy;
      if (r.color !== undefined) color = r.color;
      if (r.opacity !== undefined) opacity = (opacity ?? 1) * r.opacity;
      if (r.scale !== undefined) scale = (scale ?? 1) * r.scale;
      if (r.char !== undefined) char = r.char;
    }

    return { dx, dy, color, opacity, scale, char };
  };
}

/** Create a preset effect by name. */
export function textEffect(
  type:
    | "wave"
    | "sway"
    | "shake"
    | "rainbow"
    | "glitch"
    | "pulse"
    | "throb"
    | "fadeIn"
    | "popIn"
    | "float"
    | "flicker"
    | "spiral"
    | "scatter",
  opts?: Record<string, number>,
): TextEffectFn {
  const o = opts ?? {};
  switch (type) {
    case "wave":
      return wave(o.amplitude, o.frequency, o.speed);
    case "sway":
      return sway(o.amplitude, o.frequency, o.speed);
    case "shake":
      return shake(o.magnitude, o.speed);
    case "rainbow":
      return rainbow(o.speed, o.spread);
    case "glitch":
      return glitch(o.intensity);
    case "pulse":
      return pulse(o.speed, o.min);
    case "throb":
      return throb(o.speed, o.min, o.max);
    case "fadeIn":
      return fadeIn(o.delay, o.duration);
    case "popIn":
      return popIn(o.delay, o.duration);
    case "float":
      return float(o.amplitude, o.speed, o.spread);
    case "flicker":
      return flicker(o.speed, o.chance);
    case "spiral":
      return spiral(o.radius, o.speed, o.duration);
    case "scatter":
      return scatter(o.distance, o.duration);
  }
}
