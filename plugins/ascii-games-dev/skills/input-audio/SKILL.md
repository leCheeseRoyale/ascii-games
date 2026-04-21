---
name: input-audio
description: Use when working with input handling, keyboard bindings (`InputBindings`, `pressed`, `held`, `released`), mouse state (`Mouse`, `justDown`, `justUp`, `wheelDelta`), gamepad support, touch controls (`Touch`, `VirtualJoystick`, `VirtualDpad`), action-to-key mapping, runtime key rebinding (`capture`), conflict detection (`findConflicts`), audio synthesis (`sfx`, `beep`, `zzfx`), music playback (`playMusic`, `stopMusic`, `playTrackerMusic`), volume control (`setVolume`, `toggleMute`), or `ZzFX`/`ZzFXM` procedural sound. Also use when building settings screens with keybinding UI.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Input and audio subsystems

Two subsystems that handle player interaction (keyboard, mouse, gamepad, touch) and sound (procedural synthesis, file-based music). Both are designed for zero-dependency operation — no audio files required, no input framework needed.

## Source files

| File | What it provides |
|---|---|
| `engine/input/bindings.ts` | `InputBindings` class — semantic action mapping, capture, persistence, conflict detection |
| `engine/input/mouse.ts` | `Mouse` class — canvas-relative coordinates, click/wheel state, per-frame edge detection |
| `engine/audio/audio.ts` | `sfx` presets, `beep()`, `playMusic()`, `playTrackerMusic()`, volume/mute control |

## Input architecture

### Why semantic actions

Game code never checks raw keys. Instead:

```typescript
// Game code reads actions, not keys
if (input.pressed('action-a')) shoot()
if (input.held('move-right')) player.velocity.vx = speed
```

`InputBindings` maps **action names → physical inputs** (keys, gamepad buttons, mouse buttons). This decouples game logic from hardware, enabling:
- Runtime rebinding (settings menu)
- Gamepad support without changing game code
- Persistence (save/load bindings to localStorage)
- Conflict detection (two actions sharing a key)

### Default bindings

```
move-up:    ArrowUp, KeyW, Gamepad 12 (D-pad up)
move-down:  ArrowDown, KeyS, Gamepad 13
move-left:  ArrowLeft, KeyA, Gamepad 14
move-right: ArrowRight, KeyD, Gamepad 15
action-a:   Space, Enter, Gamepad 0 (A/Cross)
action-b:   Escape, Gamepad 1 (B/Circle)
action-x:   KeyQ, Gamepad 2 (X/Square)
action-y:   KeyE, Gamepad 3 (Y/Triangle)
pause:      Escape, Gamepad 9 (Start)
```

### InputBindings API

```typescript
const input = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse)

// Read input (polling — call in system update)
input.pressed('action-a')    // true only on the frame the input was pressed (edge)
input.held('move-right')     // true while any bound input is held (continuous)
input.released('action-b')   // true only on the frame the input was released (edge)

// Modify bindings
input.set('action-a', { keys: ['Space', 'KeyZ'], gamepadButtons: [0] })
input.get('action-a')        // → BindingEntry { keys, gamepadButtons, mouseButtons }
input.clear('action-a')      // remove binding

// Bulk operations
input.setAll(bindings)       // replace all (e.g., after loading from storage)
input.getAll()               // export all (e.g., before saving)

// Persistence
input.save('my-bindings')    // save to localStorage
input.load('my-bindings')    // load from localStorage (returns true if found)

// Conflict detection
input.findConflicts()        // → [{ input: "key:Space", actions: ["action-a", "pause"] }]
```

### Runtime rebinding with `capture()`

```typescript
const result = await input.capture('action-a', 10)  // wait up to 10s for next input
// result: BindingEntry { keys: ["KeyZ"] } or null (timeout/cancelled via Escape)
```

**How capture works:**
1. Polls every 16ms for any new input
2. Checks keyboard (`justPressed` set), gamepad (buttons 0-16), mouse (`justDown`)
3. Escape cancels (returns null)
4. Timeout after `timeoutSec` (default 10s, returns null)
5. On detection: assigns the input to the action, returns the new binding

**Settings screen pattern:**
```typescript
// Show "Press a key for Jump..."
const binding = await input.capture('jump', 10)
if (binding) {
  const conflicts = input.findConflicts()
  if (conflicts.length > 0) showConflictWarning(conflicts)
  input.save()
}
```

### Mouse state

```typescript
engine.mouse.x           // canvas-relative X (updated on mousemove)
engine.mouse.y           // canvas-relative Y
engine.mouse.down        // currently held
engine.mouse.justDown    // true only on press frame (edge)
engine.mouse.justUp      // true only on release frame (edge)
engine.mouse.wheelDelta  // scroll delta this frame (reset each frame)
engine.mouse.button      // which button (0=left, 1=middle, 2=right)
```

**Per-frame update:** `mouse.update()` is called once per frame by the engine to flush pending events into `justDown`/`justUp`/`wheelDelta`. Previous-frame edges are cleared.

**Coordinate system:** Uses `canvas.getBoundingClientRect()` for offset calculation. Coordinates are relative to the canvas element, not the page.

### Gamepad

Standard Gamepad API wrapper. Button indices follow the W3C standard mapping:
- 0-3: Face buttons (A/B/X/Y)
- 4-5: Bumpers (LB/RB)
- 6-7: Triggers (LT/RT)
- 8: Back/Select
- 9: Start
- 10-11: Stick press (L3/R3)
- 12-15: D-pad (up/down/left/right)

### Touch and virtual controls

For mobile support:
- `Touch` — touch event tracking on canvas
- `VirtualJoystick` — on-screen analog stick
- `VirtualDpad` — on-screen directional pad
- `engine.viewport.safeArea` — notch/cutout avoidance

## Audio architecture

### Why ZzFX

The engine uses **ZzFX** for sound effects and **ZzFXM** for tracker music. Why:
- **Zero audio files** — all sounds are procedurally generated from numeric parameters
- **Tiny footprint** — ZzFX is ~1KB minified. No audio loading, no fetch latency
- **Deterministic** — same parameters = same sound every time
- **Easy to tweak** — adjust parameters to tune feel (pitch, duration, distortion)

### Sound effects

Pre-defined presets for common game events:

```typescript
sfx.shoot()     // short, high-pitched blip
sfx.hit()       // impact sound
sfx.pickup()    // bright collection chime
sfx.explode()   // bass explosion
sfx.menu()      // soft UI click
sfx.death()     // descending warble

// Custom ZzFX parameters (raw array)
sfx.custom(volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide)
```

**Simple tone helper:**
```typescript
beep({ freq: 440, duration: 0.1, volume: 0.15 })  // quick A4 beep
```

### Volume and mute control

```typescript
setVolume(0.7)       // master volume [0, 1]
getVolume()          // current volume
mute()               // mute all audio
unmute()             // unmute
toggleMute()         // toggle, returns new state
isMuted()            // check
```

Volume applies to both SFX and music. When muted, all `sfx.*()` calls produce silence (volume multiplied by 0).

### File-based music

```typescript
playMusic('/assets/bgm.mp3', { volume: 0.3, loop: true })
stopMusic()
pauseMusic()
resumeMusic()
setMusicVolume(0.5)
```

**Autoplay handling:** If the browser blocks autoplay (no user gesture), the engine listens for the first click or keydown and retries. No manual handling needed.

### Tracker music (ZzFXM)

Procedural music from tracker-style patterns — no audio files:

```typescript
const song: TrackerSong = {
  instruments: [...],   // ZzFX synth parameters per instrument
  patterns: [...],      // note sequences
  sequence: [0, 1, 0, 2],  // pattern playback order
  bpm: 120,
}

playTrackerMusic(song, { loop: true, volume: 0.3 })
stopTrackerMusic()
```

**Limitation:** `AudioBufferSourceNode` doesn't support live volume changes. To change volume, stop and restart the track. This is a Web Audio API constraint, not an engine limitation.

**Use cases:** Chip-tune style music for retro games. Define songs as data, no audio files to host or load.

## Common patterns

### Movement input with actions

```typescript
const playerInput = defineSystem({
  name: 'player-input',
  update: (engine, dt) => {
    const player = engine.findByTag('player')
    if (!player) return
    
    const speed = 200
    player.velocity.vx = 0
    player.velocity.vy = 0
    
    if (engine.input.held('move-left'))  player.velocity.vx = -speed
    if (engine.input.held('move-right')) player.velocity.vx = speed
    if (engine.input.held('move-up'))    player.velocity.vy = -speed
    if (engine.input.held('move-down'))  player.velocity.vy = speed
    
    if (engine.input.pressed('action-a')) {
      sfx.shoot()
      engine.spawn(createBullet(player.position.x, player.position.y))
    }
  },
})
```

### Mouse-based input (defineGame)

```typescript
render(ctx) {
  const { engine } = ctx
  if (engine.mouse.justDown) {
    const col = Math.floor(engine.mouse.x / cellSize)
    const row = Math.floor(engine.mouse.y / cellSize)
    ctx.moves.place(col * COLS + row)
  }
}
```

### Settings screen with rebinding

```typescript
async function rebindAction(action: string) {
  showMessage(`Press a key for ${action}...`)
  const result = await engine.input.capture(action, 10)
  if (result) {
    const conflicts = engine.input.findConflicts()
    if (conflicts.length > 0) {
      showMessage(`Warning: ${conflicts[0].input} is used by ${conflicts[0].actions.join(', ')}`)
    }
    engine.input.save()
  } else {
    showMessage('Cancelled')
  }
}
```

## Things NOT to do

- Don't check raw key codes (`engine.keyboard.pressed('KeyW')`) in game logic — use semantic actions (`engine.input.held('move-up')`).
- Don't play SFX every frame — play on event edges (`pressed`, not `held`).
- Don't use `new Audio()` directly — use `playMusic()` which handles autoplay blocking and volume control.
- Don't assume gamepad is always connected — the engine handles disconnection gracefully; `input.held()` returns false for disconnected gamepads.
- Don't skip `input.save()` after rebinding — users expect their bindings to persist.
