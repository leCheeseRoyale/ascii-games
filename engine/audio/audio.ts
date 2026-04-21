/**
 * Procedural game audio powered by ZzFX + ZzFXM.
 * No audio files needed — tiny synthesized sound effects and tracker music.
 */

import { type Channel, type Instrument, type Pattern, ZZFXM } from "@zzfx-studio/zzfxm";
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

  /** Play a custom ZzFX sound. Pass raw zzfx parameters. */
  custom: (...params: number[]) => {
    if (params.length > 0) {
      params[0] = vol(params[0] ?? 0.15);
    }
    zzfx(...params);
  },
};

// ---------------------------------------------------------------------------
// Volume & mute control
// ---------------------------------------------------------------------------

/** Set master volume (0 to 1). Affects all SFX and music. */
export function setVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v));
}

/** Get current master volume. */
export function getVolume(): number {
  return masterVolume;
}

/** Mute all audio. */
export function mute(): void {
  muted = true;
  if (currentMusic) currentMusic.volume = 0;
}

/** Unmute all audio. */
export function unmute(): void {
  muted = false;
  if (currentMusic) currentMusic.volume = musicVolume * masterVolume;
}

/** Toggle mute state. Returns new muted state. */
export function toggleMute(): boolean {
  if (muted) unmute();
  else mute();
  return muted;
}

/** Check if audio is muted. */
export function isMuted(): boolean {
  return muted;
}

// ---------------------------------------------------------------------------
// Music playback
// ---------------------------------------------------------------------------

let currentMusic: HTMLAudioElement | null = null;
let musicVolume = 0.3;

/** Play background music from a URL. Loops by default. */
export function playMusic(src: string, opts: { volume?: number; loop?: boolean } = {}): void {
  stopMusic();
  const audio = new Audio(src);
  audio.loop = opts.loop ?? true;
  musicVolume = opts.volume ?? 0.3;
  audio.volume = muted ? 0 : musicVolume * masterVolume;
  audio.play().catch(() => {
    // Autoplay blocked — retry on first user interaction
    const resume = () => {
      audio.play().catch(() => {});
      document.removeEventListener("click", resume);
      document.removeEventListener("keydown", resume);
    };
    document.addEventListener("click", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  });
  currentMusic = audio;
}

/** Stop current background music (both file-based and tracker). */
export function stopMusic(): void {
  if (currentMusic) {
    currentMusic.pause();
    currentMusic.src = "";
    currentMusic = null;
  }
  stopTrackerMusic();
}

/** Pause current background music. */
export function pauseMusic(): void {
  if (currentMusic) currentMusic.pause();
}

/** Resume paused background music. */
export function resumeMusic(): void {
  if (currentMusic) currentMusic.play().catch(() => {});
}

/** Set music volume independently (0 to 1). */
export function setMusicVolume(v: number): void {
  musicVolume = Math.max(0, Math.min(1, v));
  if (currentMusic) currentMusic.volume = muted ? 0 : musicVolume * masterVolume;
}

// ---------------------------------------------------------------------------
// Tracker music playback (ZzFXM)
// ---------------------------------------------------------------------------

/** Song data for the ZzFXM procedural tracker. */
export interface TrackerSong {
  instruments: Instrument[];
  patterns: Pattern[];
  sequence: number[];
  bpm?: number;
}

let currentTracker: AudioBufferSourceNode | null = null;

/**
 * Play procedural tracker music via ZzFXM.
 * Loops by default. Stops any previously playing tracker music.
 *
 * Note: AudioBufferSourceNode does not support live volume changes.
 * Changing masterVolume or muting after playback starts will not affect the
 * current tracker — call `playTrackerMusic` again to apply new volume, or
 * `stopTrackerMusic` to silence it.
 */
export function playTrackerMusic(
  song: TrackerSong,
  opts?: { loop?: boolean; volume?: number },
): void {
  stopTrackerMusic();
  if (muted) return;

  const loop = opts?.loop ?? true;
  const volume = opts?.volume ?? 1;
  const samples = ZZFXM.build(song.instruments, song.patterns, song.sequence, song.bpm);
  currentTracker = ZZFXM.play(samples, volume * masterVolume, undefined, undefined, loop);
}

/** Stop current tracker music. */
export function stopTrackerMusic(): void {
  if (currentTracker) {
    try {
      currentTracker.stop();
    } catch {
      /* already stopped */
    }
    currentTracker = null;
  }
}

// Re-export ZzFXM types for game code convenience
export type { Channel, Instrument, Pattern };
