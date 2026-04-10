# Plan C2: Audio Expansion

## Problem
The engine only has 6 hardcoded ZzFX sound effects and no music support. Games can't define custom sounds, control volume, or play background music.

## Items addressed
- #20: Background music playback
- #21: Custom SFX from ZzFX parameters
- #22: Volume control
- #23: Mute toggle

## File: `engine/audio/audio.ts` (modify existing)

### 1. Add volume state and control

Add at the top of the file, after imports:

```ts
let masterVolume = 0.5;
let muted = false;

function effectiveVolume(v: number): number {
  return muted ? 0 : v * masterVolume;
}
```

### 2. Update existing `beep()` to respect volume

```ts
export function beep(opts: ToneOpts = {}): void {
  const { freq = 440, duration = 0.1, volume = 0.15 } = opts;
  zzfx(effectiveVolume(volume), 0.1, freq, duration, duration * 0.5, 0, 0, 0, 0);
}
```

### 3. Update all `sfx` presets to respect volume

Replace each preset to use `effectiveVolume`:

```ts
export const sfx = {
  shoot: () => zzfx(effectiveVolume(0.15), 0.05, 880, 0.05, 0.02, 0, 1, 0, 0),
  hit: () => zzfx(effectiveVolume(0.15), 0.1, 220, 0.02, 0.15, 0, 2, 0, 0),
  pickup: () => zzfx(effectiveVolume(0.15), 0.05, 660, 0.02, 0.08, 0, 0, 0, 0),
  explode: () => zzfx(effectiveVolume(0.2), 0.1, 110, 0.01, 0.3, 0, 4, 0, 3),
  menu: () => zzfx(effectiveVolume(0.1), 0.05, 520, 0.01, 0.06, 0, 0, 0, 0),
  death: () => zzfx(effectiveVolume(0.2), 0.1, 200, 0.05, 0.4, 0, 4, 2, 5),

  /** Play a custom ZzFX sound. Pass raw zzfx parameters. */
  custom: (...params: number[]) => {
    if (params.length > 0) {
      params[0] = effectiveVolume(params[0] ?? 0.15);
    }
    zzfx(...params);
  },
};
```

### 4. Add volume/mute control exports

```ts
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
  if (muted) unmute(); else mute();
  return muted;
}

/** Check if audio is muted. */
export function isMuted(): boolean {
  return muted;
}
```

### 5. Add music playback

```ts
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
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  });
  currentMusic = audio;
}

/** Stop current background music. */
export function stopMusic(): void {
  if (currentMusic) {
    currentMusic.pause();
    currentMusic.src = '';
    currentMusic = null;
  }
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
```

## Rules
- ONLY modify files in `engine/audio/`
- Do NOT touch `engine/index.ts` — integration agent handles new exports
- Do NOT touch `engine/core/engine.ts`
- Handle autoplay blocking gracefully (browsers require user interaction before audio)
- Run `bun run check` and `bun run build` to verify

## Verification
- `bun run check` passes
- `bun run build` succeeds
- Existing `sfx.shoot()` etc. still work (now with volume control)
- New exports compile: `playMusic`, `stopMusic`, `setVolume`, `mute`, `toggleMute`, etc.
