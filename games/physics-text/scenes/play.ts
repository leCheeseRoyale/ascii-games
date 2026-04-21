/**
 * Physics Text Demo — Interactive ASCII Art
 *
 * Demonstrates the engine's spring-physics text capabilities:
 *   1. Multi-layer ASCII art (stars, mountains, creature) with different spring strengths
 *   2. Title banner using spawnText() for per-character physics
 *   3. Cursor repulsion — characters flee the mouse, then spring home
 *   4. Initial scatter animation — characters start at random positions and settle
 *   5. Ambient drift — subtle floating motion on background stars
 *
 * Each character is its own entity with position, velocity, and a spring component
 * that pulls it back to its "home" position. The _spring built-in system (priority 15)
 * handles the physics; we just add forces (repulsion, drift) and the spring corrects.
 *
 * Read top-to-bottom — this file is structured as a learning resource.
 */

import type { Engine, Entity } from "@engine";
import { defineScene, defineSystem, FONTS } from "@engine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Spring presets — higher strength = snappier return to home position,
// damping in 0.88–0.96 range feels natural
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SPRINGS = {
  stiff:  { strength: 0.12, damping: 0.90 },  // Title: snaps back quickly
  bouncy: { strength: 0.08, damping: 0.88 },  // Creature: responsive, bouncy
  floaty: { strength: 0.04, damping: 0.95 },  // Stars/mountains: slow, dreamy
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ASCII Art — 3 layers + a title. Keep character counts modest for 60fps.
// Spaces are skipped (no entity spawned), so wide art is cheap.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Layer 0: Background stars — scattered points, very floaty springs
const STARS = [
  "     .        +    .        *          .     ",
  "  +       .           .        +    .       + ",
  "       *       .   +       .       *     .    ",
  "  .       +          *       .   +       .    ",
  "     .        .   .       +        .   *      ",
  "  +      *          .       .   +       .   + ",
];

// Layer 1: Mountain range — medium springs, solid shapes
const MOUNTAINS = [
  "                       /\\                      ",
  "                      /  \\        /\\            ",
  "             /\\      /    \\      /  \\           ",
  "            /  \\    /      \\    /    \\    /\\    ",
  "       /\\  /    \\  /        \\  /      \\  /  \\   ",
  "      /  \\/      \\/          \\/        \\/    \\  ",
  "  /\\ /    \\                                  \\ ",
  " /  V      \\                                  \\",
];

// Layer 2: Creature (fox) — bouncy springs, detailed character art
const FOX = [
  "       /\\_/\\       ",
  "      ( o.o )      ",
  "       > ^ <       ",
  "      /|   |\\      ",
  "     (_|   |_)     ",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color palettes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STAR_COLORS = ["#334466", "#445577", "#2a3a5a", "#3d4e6e", "#556688"];
const MOUNTAIN_BODY = "#2a6644";
const MOUNTAIN_PEAK = "#88bbaa";
const FOX_BODY = "#ee8833";
const FOX_FACE = "#ffcc66";
const FOX_EYES = "#44ee88";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System 1: Cursor repulsion
//
// For every entity with position + velocity + spring, check distance to
// the mouse cursor. If within radius, apply an outward force proportional
// to closeness. The default system priority (0) runs before _spring (15),
// so repulsion is applied first and the spring corrects on the same frame.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REPEL_RADIUS = 100;
const REPEL_FORCE = 400;

const cursorRepelSystem = defineSystem({
  name: "cursor-repel",
  update(engine: Engine) {
    // Account for camera offset so repulsion works if camera moves
    const mx = engine.mouse.x + engine.camera.x - engine.renderer.width / 2;
    const my = engine.mouse.y + engine.camera.y - engine.renderer.height / 2;

    // Materialize query to avoid issues if world changes during iteration
    const entities = [...engine.world.with("position", "velocity", "spring")];
    const radiusSq = REPEL_RADIUS * REPEL_RADIUS;

    for (const e of entities) {
      const dx = e.position.x - mx;
      const dy = e.position.y - my;
      const distSq = dx * dx + dy * dy;

      // Early exit for distant entities (avoids sqrt)
      if (distSq > radiusSq || distSq < 0.01) continue;

      const dist = Math.sqrt(distSq);
      // Force falls off linearly from full strength at center to 0 at radius
      const force = REPEL_FORCE * ((REPEL_RADIUS - dist) / REPEL_RADIUS);
      e.velocity.vx += (dx / dist) * force;
      e.velocity.vy += (dy / dist) * force;
    }
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System 2: Ambient drift
//
// Adds a gentle sine-wave wobble to star entities, giving the background
// a "breathing" quality. Each star gets a unique phase based on its home
// position so they don't move in lockstep.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ambientDriftSystem = defineSystem({
  name: "ambient-drift",
  update(engine: Engine) {
    const t = engine.time.elapsed;
    const entities = [...engine.world.with("position", "velocity", "spring")];

    for (const e of entities) {
      // Only drift stars — other layers stay put unless disturbed
      if (!e.tags?.values.has("star")) continue;

      // Derive a unique phase from the star's home position
      const seed = e.spring.targetX * 0.01 + e.spring.targetY * 0.013;
      e.velocity.vx += Math.sin(t * 0.5 + seed) * 0.3;
      e.velocity.vy += Math.cos(t * 0.4 + seed * 1.3) * 0.2;
    }
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color helpers — pick per-character colors for each art layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function starColor(): string {
  return STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
}

function mountainColor(row: number, totalRows: number): string {
  // Snow-capped peaks on the top third
  return row < totalRows * 0.3 ? MOUNTAIN_PEAK : MOUNTAIN_BODY;
}

function foxColor(char: string): string {
  if (char === "o" || char === ".") return FOX_EYES;
  if (char === "^" || char === "(" || char === ")") return FOX_FACE;
  return FOX_BODY;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Spawn helper — turns an ASCII art array into individual character entities
//
// Each non-space character becomes its own entity with:
//   - position: starts offset by `initialScatter` from home
//   - velocity: random initial kick for the scatter animation
//   - ascii: the character, font, color, and layer
//   - spring: pulls it back to its home (grid) position
//   - tags: for filtering in systems (e.g. "star" for drift)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function spawnArtLayer(
  engine: Engine,
  art: string[],
  baseX: number,
  baseY: number,
  font: string,
  colorFn: (char: string, row: number, col: number) => string,
  spring: { strength: number; damping: number },
  tag: string,
  layer: number,
  initialScatter: number,
) {
  // Monospace character width is roughly 60% of font pixel size
  const fontSize = parseFloat(font);
  const charW = fontSize * 0.6;
  const lineH = fontSize * 1.3;

  for (let row = 0; row < art.length; row++) {
    const line = art[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === " ") continue; // Skip spaces — no entity needed

      // Home position: where this character belongs in the grid
      const homeX = baseX + col * charW;
      const homeY = baseY + row * lineH;

      // Random offset for the initial scatter-and-settle animation
      const scatterX = (Math.random() - 0.5) * initialScatter;
      const scatterY = (Math.random() - 0.5) * initialScatter;

      engine.spawn({
        position: { x: homeX + scatterX, y: homeY + scatterY },
        velocity: {
          vx: (Math.random() - 0.5) * initialScatter * 0.5,
          vy: (Math.random() - 0.5) * initialScatter * 0.5,
        },
        ascii: { char: ch, font, color: colorFn(ch, row, col), layer },
        spring: {
          targetX: homeX,
          targetY: homeY,
          strength: spring.strength,
          damping: spring.damping,
        },
        tags: { values: new Set([tag, "text-char"]) },
      } as Partial<Entity>);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scene definition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const playScene = defineScene({
  name: "play",

  setup(engine: Engine) {
    const cw = engine.width;
    const ch = engine.height;

    // ── Layer 0: Background stars ─────────────────────────────────
    // Floaty springs (low strength, high damping) = slow, dreamy drift.
    // Wide initial scatter so they float in from all directions.
    const starArtW = STARS[0].length * 12 * 0.6;
    spawnArtLayer(
      engine,
      STARS,
      (cw - starArtW) / 2,
      20,
      FONTS.small,
      () => starColor(),
      SPRINGS.floaty,
      "star",
      0,       // layer (render order)
      300,     // initial scatter radius
    );

    // ── Layer 1: Mountains ────────────────────────────────────────
    // Medium springs — responsive but not twitchy.
    // Snow-capped peaks via the mountainColor helper.
    const mtArtW = MOUNTAINS[0].length * 16 * 0.6;
    spawnArtLayer(
      engine,
      MOUNTAINS,
      (cw - mtArtW) / 2,
      ch * 0.4,
      FONTS.normal,
      (_char, row) => mountainColor(row, MOUNTAINS.length),
      { strength: 0.06, damping: 0.92 },
      "mountain",
      1,
      200,
    );

    // ── Layer 2: Fox creature ─────────────────────────────────────
    // Bouncy springs — satisfying to poke with the cursor.
    // Larger scatter for a dramatic entrance.
    const foxArtW = FOX[0].length * 16 * 0.6;
    spawnArtLayer(
      engine,
      FOX,
      (cw - foxArtW) / 2,
      ch * 0.25,
      FONTS.normal,
      (char) => foxColor(char),
      SPRINGS.bouncy,
      "fox",
      2,
      400,
    );

    // ── Layer 3: Title banner via spawnText() ─────────────────────
    // spawnText() decomposes the string into per-character entities,
    // each with its own position, velocity, spring, and auto-collider.
    // Stiff springs so the title snaps into place quickly.
    engine.spawnText({
      text: "PHYSICS TEXT",
      font: '28px "Fira Code", monospace',
      position: { x: cw / 2, y: ch * 0.08 },
      color: "#00ffaa",
      spring: SPRINGS.stiff,
      tags: ["title"],
    });

    // ── Hint text (single entity, not decomposed) ─────────────────
    engine.spawn({
      position: { x: cw / 2, y: ch - 36 },
      ascii: {
        char: "move your mouse to disturb the characters",
        font: FONTS.small,
        color: "#445566",
        layer: 4,
      },
    });

    // ── Register systems ──────────────────────────────────────────
    // Both default to priority 0, which runs before _spring (15).
    // This means forces are applied first, then the spring corrects.
    engine.addSystem(cursorRepelSystem);
    engine.addSystem(ambientDriftSystem);
  },

  update(_engine: Engine, _dt: number) {
    // No scene-level logic needed — the two systems handle everything.
  },
});
