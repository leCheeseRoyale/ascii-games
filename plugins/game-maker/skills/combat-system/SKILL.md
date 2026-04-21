---
name: combat-system
description: Use when the user wants to add combat, health, damage, hit points, death, respawning, invincibility frames, loot drops, XP, leveling up, or hit feedback to their game. Triggers on "add health", "damage system", "enemy dies", "player takes damage", "add HP bar", "loot drops", "XP and leveling", "i-frames".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Combat system

Health, damage, death, and everything that comes with fighting.

## Add health to an entity

Just include the `health` component:

```ts
export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.normal, color: COLORS.accent },
    collider: { type: 'circle', width: 14, height: 14 },
    health: { current: 5, max: 5 },
    tags: { values: new Set(['player']) },
  }
}
```

## The damage system (recommended)

The engine has a built-in damage processor. Set it up once:

```ts
import { createDamageSystem, createDamageFlash, sfx } from '@engine'

const damageSystem = createDamageSystem({
  invincibilityDuration: 0.5,  // half-second of i-frames after each hit

  onDamage(entity, damage, engine) {
    // Called when damage is about to apply. Return false to cancel.
    createDamageFlash(entity, engine)  // red flash + camera shake + particles
    sfx.hit()
    return true
  },

  onDeath(entity, lastDamage, engine) {
    if (entity.tags?.values.has('enemy')) {
      engine.particles.explosion(entity.position.x, entity.position.y)
      sfx.explode()
      engine.destroy(entity)
    }
    if (entity.tags?.values.has('player')) {
      engine.loadScene('game-over', { transition: 'fade', duration: 0.5 })
    }
  },
})

// In scene setup:
engine.addSystem(damageSystem)
```

## Dealing damage

To hurt an entity, set its `damage` component. The damage system processes it next frame:

```ts
// Direct assignment (e.g., in a collision handler)
enemy.damage = { amount: 1, source: 'player', type: 'melee' }

// Via collision callback
engine.onCollide('bullet', 'enemy', (bullet, enemy) => {
  enemy.damage = { amount: 1, source: 'bullet' }
  engine.destroy(bullet)
})

// Via overlap check in a system
import { overlaps } from '@engine'

for (const enemy of [...engine.world.with('position', 'collider', 'health')]) {
  if (enemy.tags?.values.has('enemy') && overlaps(player, enemy)) {
    player.damage = { amount: 1, source: 'enemy' }
  }
}
```

**Important:** `damage` is a one-shot trigger. Set it once, the system processes and removes it. Don't set it every frame.

## Simple manual combat (no damage system)

For simpler games, skip the damage system and handle it directly:

```ts
engine.onCollide('player', 'enemy', (player, enemy) => {
  player.health.current -= 1
  sfx.hit()
  engine.camera.shake(6)
  engine.floatingText(player.position.x, player.position.y - 10, '-1', '#ff4444')

  if (player.health.current <= 0) {
    engine.loadScene('game-over')
  }
})
```

## Loot drops on death

```ts
import { rollLoot, createSeededRandom, type LootTable } from '@engine'

const enemyLoot: LootTable<string> = {
  entries: [
    { item: 'gold', weight: 5, count: [1, 5] },
    { item: 'potion', weight: 2 },
    { item: 'rare-sword', weight: 1, chance: 0.3 },
  ],
  rolls: 1,
}

// In onDeath callback:
onDeath(entity, damage, engine) {
  const drops = rollLoot(enemyLoot, { seed: Date.now() })
  for (const drop of drops) {
    engine.floatingText(entity.position.x, entity.position.y, `+${drop.item}`, '#ffcc00')
    // Add to player inventory, increment score, etc.
  }
  engine.destroy(entity)
}
```

## XP and leveling

```ts
// Track in module-level state or on the player entity
let xp = 0
let level = 1
const XP_PER_LEVEL = 100

function grantXP(amount: number, engine: Engine) {
  xp += amount
  engine.floatingText(/* ... */, `+${amount} XP`, '#aa44ff')

  while (xp >= XP_PER_LEVEL * level) {
    level++
    engine.toast.show(`Level ${level}!`, { color: '#ffcc00' })
    engine.camera.shake(6)
    engine.particles.burst({
      x: engine.centerX, y: engine.centerY,
      count: 30, chars: ['★', '✦'], color: '#ffcc00',
      speed: 180, lifetime: 1, spread: Math.PI * 2,
    })
    sfx.menu()
    // Increase player stats, unlock abilities, etc.
  }
}
```

## Health bar on the HUD

### Canvas-based (no React)

```ts
// In a HUD system or scene update:
const player = engine.findByTag('player')
if (player?.health) {
  const ratio = player.health.current / player.health.max
  engine.ui.bar(10, 10, 20, ratio, {
    fillColor: ratio > 0.5 ? '#00ff88' : ratio > 0.25 ? '#ffaa00' : '#ff4444',
    emptyColor: '#333333',
  })
  engine.ui.text(10, 30, `HP: ${player.health.current}/${player.health.max}`, {
    font: FONTS.small, color: '#cccccc',
  })
}
```

### React HUD

```ts
// In your system (write to store):
useStore.getState().setHealth(player.health.current, player.health.max)

// The default HealthBar component reads this automatically
```

## Hit feedback combos

| Situation | Combo |
|---|---|
| Light hit | `sfx.hit()` + `engine.camera.shake(3)` + floating text |
| Heavy hit | `createDamageFlash(entity, engine)` + `engine.camera.shake(8)` + floating text |
| Enemy death | `engine.particles.explosion(x, y)` + `sfx.explode()` + `engine.camera.shake(6)` |
| Player death | `engine.camera.shake(12)` + `engine.flash('#ff0000')` + `sfx.death()` |
| Pickup | `engine.particles.sparkle(x, y)` + `sfx.pickup()` + floating text |

## Invincibility blink

```ts
// After taking damage, make the player blink
engine.blink(player, 0.5, 0.1)  // blink for 0.5s, toggling every 0.1s
```

## Knockback

```ts
// Push entity away from a point
engine.knockback(player, enemy.position.x, enemy.position.y, 300)
```

## Reference templates

| Pattern | Look at |
|---|---|
| Collision → damage → death | `games/asteroid-field/systems/collision.ts` |
| Turn-based combat with stats | `games/roguelike/systems/combat.ts` |
| Damage flash + particles | `games/asteroid-field/systems/collision.ts` |
