# Game Feel & Input

Recipes for juice effects, screen shake, particles, sound, and input handling. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Game Feel & Juice

### Screen flash
Flash the entire screen with a color overlay that fades out. Useful for damage feedback, powerup pickups, or lightning effects.
```ts
// Flash red on player damage
engine.flash("#ff4444", 0.15);

// Flash white on powerup pickup
engine.flash("#ffffff", 0.1);
```

### Entity blinking (i-frames)
Oscillate an entity's opacity for invincibility frames, warnings, or low-health indicators.
```ts
// Blink player for 1 second after taking damage
engine.blink(player, 1.0, 0.08);
```

### Knockback
Apply an impulse that pushes an entity away from a point. The entity needs `velocity` for this to work.
```ts
// Push enemy away from explosion center
engine.knockback(enemy, explosionX, explosionY, 500);

// Push enemy away from bullet on hit
engine.knockback(enemy, bullet.position!.x, bullet.position!.y, 300);
```

### Slow motion
`engine.timeScale` multiplies `dt` for all systems. Set below 1 for slowmo, above 1 for fast-forward. Combine with `engine.after` to auto-restore.
```ts
// Dramatic slowmo for 0.5 seconds
engine.timeScale = 0.2;
engine.after(0.5, () => { engine.timeScale = 1; });
```

### Trail effect
The `trail` component auto-spawns fading afterimage entities behind any moving entity. Add it at spawn time.
```ts
// Add trail to any moving entity
engine.spawn({
  position: { x, y },
  velocity: { vx: 0, vy: -400 },
  ascii: { char: "•", font, color: "#ffcc00" },
  trail: { interval: 0.03, lifetime: 0.2, color: "#ff8800", opacity: 0.5 },
  lifetime: { remaining: 3 },
});
```

### Declarative collision handling
`engine.onCollide` replaces the manual nested-loop pattern with a one-liner. It fires on the first overlap frame per pair and returns an unsubscribe function.
```ts
// Instead of writing a collision system with nested loops:
engine.onCollide("bullet", "enemy", (bullet, enemy) => {
  engine.destroy(bullet);
  engine.destroy(enemy);
  engine.particles.explosion(enemy.position!.x, enemy.position!.y);
  sfx.explode();
  score += 100;
});

// Filter by collision groups (bitmask):
engine.spawn({
  ...createBullet(x, y),
  collider: { type: "circle", width: 6, height: 6, group: 2, mask: 0b100 },
  // group 2 = player bullets, mask 0b100 = only hits group 3 (enemies)
});
```

### Quick HUD
`drawQuickHud` renders a score/health/lives display in one call. Useful for prototyping or jam games where you don't want to wire up React.
```ts
// In your scene's update or a HUD system:
import { drawQuickHud } from '@engine';

drawQuickHud(engine.ui, engine.width, engine.height, {
  score: useStore.getState().score,
  health: { current: 80, max: 100 },
  lives: 3,
  position: "topLeft",
});
```

## Input

### Keyboard held / pressed / released
```ts
const kb = engine.keyboard;
if (kb.held("KeyW"))    moveUp();        // true while down
if (kb.pressed("Space")) jump();         // only the frame it went down
if (kb.released("KeyE")) releaseBomb();
```

### Mouse + touch unified via `Touch`
Recognizes tap / swipe / pinch. Not auto-wired — instantiate once, call `update()` per frame.
```ts
import { Touch } from "@engine";
const touch = new Touch(engine.renderer.canvas, { unifyMouse: true });
touch.onTap  ((g) => fireAt(g.x, g.y));
touch.onSwipe((g) => { if (g.direction === "up") jump(); });
// Per frame: touch.update() to drain the gesture queue
```

### VirtualJoystick + VirtualDpad on mobile
Both read a `Touch` and draw themselves. `visibleOnlyOnTouch` hides on desktop.
```ts
import { Touch, VirtualJoystick, VirtualDpad, defineSystem } from "@engine";
const touch = new Touch(engine.renderer.canvas);
const stick = new VirtualJoystick({ anchor: "bottomLeft",  touch, visibleOnlyOnTouch: true });
const dpad  = new VirtualDpad    ({ anchor: "bottomRight", touch, visibleOnlyOnTouch: true });
engine.addSystem(defineSystem({
  name: "virtual-controls",
  update(e) {
    stick.update(); dpad.update(); touch.update();
    stick.render(e.renderer.ctx, e.width, e.height);
    dpad .render(e.renderer.ctx, e.width, e.height);
  },
}));
// Read: stick.x, stick.y (-1..1), dpad.up/down/left/right
```

### Remappable bindings via `InputBindings`
```ts
import { InputBindings, createDefaultBindings } from "@engine";
const bindings = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse);
bindings.setAll(createDefaultBindings());
if (!bindings.load()) bindings.save();
if (bindings.pressed("action-a")) fire();
const captured = await bindings.capture("move-up");
if (captured) bindings.save();
for (const c of bindings.findConflicts()) console.warn("conflict:", c.input, c.actions);
```

### Gamepad sticks, triggers, buttons
```ts
import { GAMEPAD_BUTTONS } from "@engine";
const gp = engine.gamepad;
if (gp.connected) {
  const left = gp.stick("left", 0.15); // {x, y} -1..1
  const rt   = gp.trigger("right");    // 0..1
  if (gp.pressed(GAMEPAD_BUTTONS.A)) jump();
}
```
