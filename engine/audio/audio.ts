/**
 * Procedural game audio powered by ZzFX.
 * No audio files needed — tiny synthesized sound effects.
 */

import { zzfx } from "zzfx";

let masterVolume = 1.0;
let muted = false;

/** Global audio controller for volume and mute. */
export const audio = {
  get volume() {
    return masterVolume;
  },
  set volume(v: number) {
    masterVolume = Math.max(0, Math.min(1, v));
  },
  get muted() {
    return muted;
  },
  set muted(m: boolean) {
    muted = m;
  },
};

/** Apply master volume and mute to a volume value. */
function vol(v: number): number {
  return muted ? 0 : v * masterVolume;
}

export interface ToneOpts {
  freq?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
}

/** Play a simple tone via ZzFX. */
export function beep(opts: ToneOpts = {}): void {
  const { freq = 440, duration = 0.1, volume = 0.15 } = opts;
  zzfx(vol(volume), 0.1, freq, duration, duration * 0.5, 0, 0, 0, 0);
}

/** Common game sounds — ZzFX presets. */
export const sfx = {
  shoot: () => zzfx(vol(0.15), 0.05, 880, 0.05, 0.02, 0, 1, 0, 0),
  hit: () => zzfx(vol(0.15), 0.1, 220, 0.02, 0.15, 0, 2, 0, 0),
  pickup: () => zzfx(vol(0.15), 0.05, 660, 0.02, 0.08, 0, 0, 0, 0),
  explode: () => zzfx(vol(0.2), 0.1, 110, 0.01, 0.3, 0, 4, 0, 3),
  menu: () => zzfx(vol(0.1), 0.05, 520, 0.01, 0.06, 0, 0, 0, 0),
  death: () => zzfx(vol(0.2), 0.1, 200, 0.05, 0.4, 0, 4, 2, 5),
};
