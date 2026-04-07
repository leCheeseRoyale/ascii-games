/**
 * Minimal procedural audio — oscillator beeps for ASCII aesthetic.
 * No audio files needed.
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

export interface ToneOpts {
  freq?: number
  duration?: number
  type?: OscillatorType
  volume?: number
}

/** Play a simple tone. Unlocks audio context on first call. */
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

/** Common game sounds. */
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
