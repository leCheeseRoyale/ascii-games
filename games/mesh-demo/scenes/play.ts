/**
 * Image Mesh Demo — Play Scene
 *
 * Showcases the engine's image mesh system:
 *   1. Title banner via spawnText() with floaty spring physics
 *   2. Three shaped meshes (rectangle, circle, diamond) with distinct gradients
 *   3. Cursor repulsion — mouse warps all meshes in real-time
 *   4. Click-to-blast — radial impulse scatters nearby mesh cells
 *   5. R to restart — resets the scene
 *
 * Images are generated procedurally via canvas, so no external assets are needed.
 */

import type { Engine } from "@engine";
import { createCursorRepelSystem, defineScene, defineSystem, FONTS, SpringPresets } from "@engine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Procedural image generation
//
// Each mesh gets a unique gradient drawn onto a small canvas, then
// converted to an HTMLImageElement. No external files needed.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createGradientImage(
  width: number,
  height: number,
  colorA: string,
  colorB: string,
  pattern: "linear" | "radial",
): HTMLImageElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas context");

  let gradient: CanvasGradient;
  if (pattern === "radial") {
    gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  } else {
    gradient = ctx.createLinearGradient(0, 0, width, height);
  }
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(1, colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add a subtle grid pattern for visual interest
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  const step = width / 6;
  for (let x = step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = step; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Blast system — click to scatter mesh cells with a radial impulse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BLAST_RADIUS = 150;
const BLAST_FORCE = 800;

const blastSystem = defineSystem({
  name: "mesh-blast",
  update(engine: Engine) {
    if (!engine.mouse.pressed(0)) return;

    const cam = engine.camera;
    const mx = engine.mouse.x + cam.x - engine.width / 2;
    const my = engine.mouse.y + cam.y - engine.height / 2;
    const radiusSq = BLAST_RADIUS * BLAST_RADIUS;

    // Blast ECS mesh cells
    const cells = [...engine.world.with("meshCell", "position", "velocity")];
    for (const cell of cells) {
      const dx = cell.position.x - mx;
      const dy = cell.position.y - my;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSq || distSq < 0.01) continue;

      const dist = Math.sqrt(distSq);
      const force = BLAST_FORCE * ((BLAST_RADIUS - dist) / BLAST_RADIUS);
      cell.velocity.vx += (dx / dist) * force;
      cell.velocity.vy += (dy / dist) * force;
    }

    // Blast spring-text entities too (title characters)
    const springEntities = [...engine.world.with("position", "velocity", "spring")];
    for (const e of springEntities) {
      if (e.meshCell) continue; // already handled above
      const dx = e.position.x - mx;
      const dy = e.position.y - my;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSq || distSq < 0.01) continue;

      const dist = Math.sqrt(distSq);
      const force = BLAST_FORCE * 0.5 * ((BLAST_RADIUS - dist) / BLAST_RADIUS);
      e.velocity.vx += (dx / dist) * force;
      e.velocity.vy += (dy / dist) * force;
    }

    // Camera shake for feedback
    engine.camera.shake(4);
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Restart system — press R to reload the scene
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const restartSystem = defineSystem({
  name: "restart-check",
  update(engine: Engine) {
    if (engine.keyboard.pressed("KeyR")) {
      engine.restartScene();
    }
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mesh layout — descriptive data for the three demo meshes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MeshConfig {
  label: string;
  colorA: string;
  colorB: string;
  gradientType: "linear" | "radial";
  cols: number;
  rows: number;
  shape?: "circle" | "diamond";
  lineColor: string;
}

const MESH_CONFIGS: MeshConfig[] = [
  {
    label: "Rectangle",
    colorA: "#ff6b6b",
    colorB: "#4ecdc4",
    gradientType: "linear",
    cols: 8,
    rows: 8,
    lineColor: "rgba(255, 107, 107, 0.4)",
  },
  {
    label: "Circle",
    colorA: "#667eea",
    colorB: "#764ba2",
    gradientType: "radial",
    cols: 10,
    rows: 10,
    shape: "circle",
    lineColor: "rgba(102, 126, 234, 0.4)",
  },
  {
    label: "Diamond",
    colorA: "#11998e",
    colorB: "#f2e863",
    gradientType: "linear",
    cols: 10,
    rows: 10,
    shape: "diamond",
    lineColor: "rgba(17, 153, 142, 0.4)",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scene definition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const playScene = defineScene({
  name: "play",

  setup(engine: Engine) {
    const cw = engine.width;
    const ch = engine.height;

    // ── Title banner via spawnText() ─────────────────────────────
    // Each character is its own spring-physics entity. Floaty preset
    // makes them drift gently when disturbed.
    engine.spawnText({
      text: "IMAGE MESH",
      font: '28px "Fira Code", monospace',
      position: { x: cw / 2, y: ch * 0.06 },
      color: "#00ffaa",
      spring: SpringPresets.floaty,
      tags: ["title"],
      align: "center",
    });

    // ── Three shaped meshes side by side ─────────────────────────
    // Each gets a procedurally generated gradient image and a
    // different shape mask (rectangle, circle, diamond).
    const imgSize = 120;
    const meshSpacing = cw / (MESH_CONFIGS.length + 1);
    const meshY = ch * 0.25;

    for (let i = 0; i < MESH_CONFIGS.length; i++) {
      const cfg = MESH_CONFIGS[i];

      // Create procedural image
      const img = createGradientImage(imgSize, imgSize, cfg.colorA, cfg.colorB, cfg.gradientType);

      // Center each mesh horizontally in its column
      const centerX = meshSpacing * (i + 1);
      const posX = centerX - imgSize / 2;
      const posY = meshY;

      // Spawn the mesh
      engine.spawnImageMesh({
        image: img,
        cols: cfg.cols,
        rows: cfg.rows,
        position: { x: posX, y: posY },
        spring: SpringPresets.bouncy,
        showLines: true,
        lineColor: cfg.lineColor,
        lineWidth: 1,
        shape: cfg.shape,
        tags: ["mesh"],
      });

      // Label under each mesh
      engine.spawn({
        position: { x: centerX, y: posY + imgSize + 20 },
        ascii: {
          char: cfg.label,
          font: FONTS.small,
          color: "#667788",
          layer: 5,
        },
      });
    }

    // ── Instruction text ─────────────────────────────────────────
    engine.spawn({
      position: { x: cw / 2, y: ch - 40 },
      ascii: {
        char: "Move mouse to deform  •  Click to blast  •  R to reset",
        font: FONTS.small,
        color: "#445566",
        layer: 5,
      },
    });

    // ── Register systems ─────────────────────────────────────────
    engine.addSystem(createCursorRepelSystem({ radius: 100, force: 400 }));
    engine.addSystem(blastSystem);
    engine.addSystem(restartSystem);
  },

  update(_engine: Engine, _dt: number) {
    // Systems handle everything — no scene-level update needed.
  },
});
