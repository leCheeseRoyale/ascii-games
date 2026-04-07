---
title: Audio System
created: 2026-04-07
updated: 2026-04-07
type: subsystem
tags: [audio, sound, oscillator, web-audio, sfx]
sources: [engine/audio/audio.ts]
---

# Audio System

Procedural oscillator-based audio using the Web Audio API. No audio files needed — all sounds are synthesized from oscillator waveforms, fitting the ASCII aesthetic perfectly.

See also: [[engine-overview]], [[utility-reference]]

## Architecture

A single lazy `AudioContext` is shared across all sound calls:

```typescript
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
```

- Context is created on first `beep()` call, not at startup
- Automatically resumes if suspended (browsers suspend audio until user interaction)
- Single shared context avoids the browser limit on AudioContext instances

## beep(opts)

The core sound primitive. Creates an oscillator → gain node → destination chain with exponential ramp to silence:

```typescript
export interface ToneOpts {
  freq?: number        // default: 440
  duration?: number    // default: 0.1
  type?: OscillatorType  // default: 'square'
  volume?: number      // default: 0.15
}

export function beep(opts: ToneOpts = {}): void {
  const { freq = 440, duration = 0.1, type = 'square', volume = 0.15 } = opts
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = volume
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}
```

The `exponentialRampToValueAtTime` creates a natural decay envelope — the sound fades out smoothly rather than cutting off abruptly (which would cause a click).

### Waveform Types

| Type | Sound Character |
|------|----------------|
| `square` | Sharp, retro, 8-bit (default) |
| `sawtooth` | Buzzy, aggressive, richer harmonics |
| `sine` | Clean, pure, soft |
| `triangle` | Mellow, between sine and square |

## sfx Presets

Pre-configured sound effects for common game events:

```typescript
export const sfx = {
  shoot: () => beep({ freq: 880, duration: 0.05, type: 'square' }),
  hit: () => beep({ freq: 220, duration: 0.15, type: 'sawtooth' }),
  pickup: () => beep({ freq: 660, duration: 0.08, type: 'sine' }),
  explode: () => beep({ freq: 110, duration: 0.3, type: 'sawtooth', volume: 0.2 }),
  menu: () => beep({ freq: 520, duration: 0.06, type: 'sine', volume: 0.1 }),
  death: () => {
    beep({ freq: 440, duration: 0.1, type: 'sawtooth' })
    setTimeout(() => beep({ freq: 220, duration: 0.2, type: 'sawtooth' }), 100)
    setTimeout(() => beep({ freq: 110, duration: 0.4, type: 'sawtooth' }), 250)
  },
}
```

### Preset Summary

| Preset | Frequency | Duration | Waveform | Character |
|--------|-----------|----------|----------|-----------|
| `shoot` | 880 Hz | 50ms | square | Short high blip |
| `hit` | 220 Hz | 150ms | sawtooth | Low buzzy thud |
| `pickup` | 660 Hz | 80ms | sine | Clean chime |
| `explode` | 110 Hz | 300ms | sawtooth | Deep rumble (louder) |
| `menu` | 520 Hz | 60ms | sine | Soft UI click |
| `death` | 440→220→110 Hz | 100→200→400ms | sawtooth | Descending triple beep |

### death() — The Special Case

The death sound uses `setTimeout` to create a descending triple-beep pattern. Three sawtooth tones play in sequence, each lower in pitch and longer in duration, creating a classic "game over" feel.

Note: `setTimeout` is used here intentionally — this is one of the few acceptable uses in the engine (see AGENTS.md: "No setInterval/setTimeout — use Cooldown + dt"). Audio scheduling is the exception because Web Audio has its own timing system.

## Usage

```typescript
import { sfx, beep } from '@engine/audio/audio'

// Use presets
sfx.shoot()
sfx.hit()
sfx.death()

// Custom tone
beep({ freq: 1000, duration: 0.2, type: 'triangle', volume: 0.1 })
```
