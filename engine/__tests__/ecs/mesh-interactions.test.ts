import { beforeEach, describe, expect, test } from "bun:test";
import { createMeshGrabSystem } from "../../ecs/mesh-grab";
import { createMeshInputForceSystem } from "../../ecs/mesh-input-force";
import { createMeshPinSystem } from "../../ecs/mesh-pin";
import { createMeshTearSystem } from "../../ecs/mesh-tear";
import { mockEngine } from "../helpers";

/** Minimal meshCell component for testing (image is unused in headless). */
function meshCell(col: number, row: number, cols: number, rows: number) {
  return {
    image: {} as HTMLImageElement,
    srcX: 0,
    srcY: 0,
    srcW: 16,
    srcH: 16,
    col,
    row,
    cols,
    rows,
    meshId: "test-mesh",
  };
}

/** Spawn a grid of mesh cell entities for testing. */
function spawnGrid(engine: ReturnType<typeof mockEngine>, cols: number, rows: number) {
  const entities = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 100 + c * 20;
      const y = 100 + r * 20;
      entities.push(
        engine.spawn({
          position: { x, y },
          velocity: { vx: 0, vy: 0 },
          spring: { targetX: x, targetY: y, strength: 0.08, damping: 0.93 },
          meshCell: meshCell(c, r, cols, rows),
        }),
      );
    }
  }
  return entities;
}

// ── createMeshGrabSystem ─────────────────────────────────────

describe("createMeshGrabSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  test("has correct system name", () => {
    const sys = createMeshGrabSystem();
    expect(sys.name).toBe("mesh-grab");
  });

  test("does nothing when mouse is not held", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshGrabSystem();

    sys.update(engine, 0.016);

    for (const e of entities) {
      expect(e.velocity!.vx).toBe(0);
      expect(e.velocity!.vy).toBe(0);
    }
  });

  test("pulls grabbed cell toward cursor on mouse hold", () => {
    // Single cell at (100, 100) to keep math clean
    const cell = engine.spawn({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 1, 1),
    });
    const sys = createMeshGrabSystem({ grabRadius: 100, pullForce: 600, neighborForce: 0 });

    // Cursor at world (130, 110) => mouse (530, 410) with 800x600 canvas
    // World coords: mx = 530 + 0 - 400 = 130, my = 410 + 0 - 300 = 110
    engine.mouse.x = 530;
    engine.mouse.y = 410;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);

    sys.update(engine, 0.016);

    // Pull: dx = 130-100 = 30, dy = 110-100 = 10
    // velocity += dx * (600/100) = 30*6 = 180, dy * 6 = 60
    expect(cell.velocity!.vx).toBeCloseTo(180);
    expect(cell.velocity!.vy).toBeCloseTo(60);
  });

  test("continues pulling on subsequent frames while held (no justDown)", () => {
    const cell = engine.spawn({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 1, 1),
    });
    const sys = createMeshGrabSystem({ grabRadius: 100, pullForce: 600, neighborForce: 0 });

    // Frame 1: press near cell at (100, 100). World (130, 110) => mouse (530, 410)
    engine.mouse.x = 530;
    engine.mouse.y = 410;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);
    sys.update(engine, 0.016);

    // Frame 2: still held, cursor moved. justDown cleared.
    engine.mouse.buttonsJustDown.clear();
    engine.mouse.x = 550; // world x = 550 - 400 = 150
    engine.mouse.y = 420; // world y = 420 - 300 = 120

    // Reset velocity to isolate this frame's effect
    cell.velocity!.vx = 0;
    cell.velocity!.vy = 0;

    sys.update(engine, 0.016);

    // Pull: dx = 150-100 = 50, dy = 120-100 = 20; * 6 = 300, 120
    expect(cell.velocity!.vx).toBeCloseTo(300);
    expect(cell.velocity!.vy).toBeCloseTo(120);
  });

  test("releases grab when mouse is released", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshGrabSystem({ grabRadius: 100, pullForce: 600 });

    // Press
    engine.mouse.x = 530;
    engine.mouse.y = 410;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);
    sys.update(engine, 0.016);

    // Release
    engine.mouse.buttonsDown.clear();
    engine.mouse.buttonsJustDown.clear();
    entities[0].velocity!.vx = 0;
    entities[0].velocity!.vy = 0;

    sys.update(engine, 0.016);

    expect(entities[0].velocity!.vx).toBe(0);
    expect(entities[0].velocity!.vy).toBe(0);
  });

  test("does not grab cells beyond grabRadius", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshGrabSystem({ grabRadius: 5 });

    // World (200, 200) is far from cell at (100,100)
    engine.mouse.x = 600;
    engine.mouse.y = 500;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);

    sys.update(engine, 0.016);

    for (const e of entities) {
      expect(e.velocity!.vx).toBe(0);
      expect(e.velocity!.vy).toBe(0);
    }
  });

  test("respects custom button option", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshGrabSystem({ grabRadius: 100, button: 2 });

    // Press button 0 (left) -- should be ignored
    engine.mouse.x = 500;
    engine.mouse.y = 400;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);
    sys.update(engine, 0.016);

    expect(entities[0].velocity!.vx).toBe(0);

    // Now press button 2 (right)
    engine.mouse.buttonsDown.clear();
    engine.mouse.buttonsJustDown.clear();
    engine.mouse.buttonsDown.add(2);
    engine.mouse.buttonsJustDown.add(2);
    engine.mouse.x = 530;
    engine.mouse.y = 410;
    sys.update(engine, 0.016);

    expect(entities[0].velocity!.vx).not.toBe(0);
  });

  test("applies neighbor force to nearby cells while dragging", () => {
    const entities = spawnGrid(engine, 2, 1); // Two cells in a row: (100,100) and (120,100)
    const sys = createMeshGrabSystem({
      grabRadius: 100,
      pullForce: 600,
      neighborForce: 150,
      neighborRadius: 80,
    });

    // Grab cell 0 at (100, 100)
    engine.mouse.x = 500;
    engine.mouse.y = 400;
    engine.mouse.buttonsDown.add(0);
    engine.mouse.buttonsJustDown.add(0);
    sys.update(engine, 0.016);

    // Cell 1 at (120, 100) is 20px from cell 0 -- within neighborRadius=80
    // It should have received a push force away from the grabbed cell
    expect(entities[1].velocity!.vx).not.toBe(0);
  });
});

// ── createMeshInputForceSystem ───────────────────────────────

describe("createMeshInputForceSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  test("has correct system name", () => {
    const sys = createMeshInputForceSystem();
    expect(sys.name).toBe("mesh-input-force");
  });

  test("does nothing when no keys are held", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshInputForceSystem();

    sys.update(engine, 0.016);

    for (const e of entities) {
      expect(e.velocity!.vx).toBe(0);
      expect(e.velocity!.vy).toBe(0);
    }
  });

  test("applies rightward force when ArrowRight is held", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 200,
      origin: "center",
    });

    // Place entities near center. Center in world = (cam.x, cam.y) = (0,0).
    // But our entities are at (100-140, 100-140). With origin='center', the
    // origin is (width/2 + cam.x - width/2, height/2 + cam.y - height/2) = (0,0).
    // All entities are >100px from (0,0), which is within radius=200.

    engine.keyboard.keys.add("ArrowRight");
    sys.update(engine, 0.016);

    // All cells within radius should have positive vx
    for (const e of entities) {
      expect(e.velocity!.vx).toBeGreaterThan(0);
      expect(e.velocity!.vy).toBe(0);
    }
  });

  test("applies upward force when KeyW is held", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 200,
      origin: "center",
    });

    engine.keyboard.keys.add("KeyW");
    sys.update(engine, 0.016);

    for (const e of entities) {
      expect(e.velocity!.vx).toBe(0);
      expect(e.velocity!.vy).toBeLessThan(0); // up = negative y
    }
  });

  test("applies diagonal force when two keys held simultaneously", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 200,
      origin: "center",
    });

    engine.keyboard.keys.add("ArrowRight");
    engine.keyboard.keys.add("ArrowDown");
    sys.update(engine, 0.016);

    for (const e of entities) {
      expect(e.velocity!.vx).toBeGreaterThan(0);
      expect(e.velocity!.vy).toBeGreaterThan(0);
    }
  });

  test("diagonal force is normalized (not sqrt(2) times stronger)", () => {
    // Spawn a single cell near origin for easy math
    const single = engine.spawn({
      position: { x: 10, y: 10 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 10, targetY: 10, strength: 0.08, damping: 0.93 },
    });
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 200,
      origin: "center",
    });

    // Single axis first
    engine.keyboard.keys.add("ArrowRight");
    sys.update(engine, 0.016);
    const singleAxisVx = single.velocity!.vx;

    // Reset
    single.velocity!.vx = 0;
    single.velocity!.vy = 0;
    engine.keyboard.keys.clear();

    // Diagonal
    engine.keyboard.keys.add("ArrowRight");
    engine.keyboard.keys.add("ArrowDown");
    sys.update(engine, 0.016);

    // Diagonal vx should be less than single-axis vx (normalized)
    expect(single.velocity!.vx).toBeLessThan(singleAxisVx);
    expect(single.velocity!.vx).toBeGreaterThan(0);
  });

  test("does not affect entities outside radius", () => {
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 10,
      origin: "center",
    });

    // Spawn cell far from center (0,0)
    const farCell = engine.spawn({
      position: { x: 500, y: 500 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 500, targetY: 500, strength: 0.08, damping: 0.93 },
    });

    engine.keyboard.keys.add("ArrowRight");
    sys.update(engine, 0.016);

    expect(farCell.velocity!.vx).toBe(0);
    expect(farCell.velocity!.vy).toBe(0);
  });

  test("cursor origin uses mouse position", () => {
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 50,
      origin: "cursor",
    });

    // Spawn cell at (100, 100)
    const cell = engine.spawn({
      position: { x: 100, y: 100 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
    });

    // Place mouse at world (100, 100) => mouse (500, 400) with 800x600 canvas
    engine.mouse.x = 500;
    engine.mouse.y = 400;

    engine.keyboard.keys.add("KeyD");
    sys.update(engine, 0.016);

    // Cell is at the origin => dist = 0 => falloff = 1 => full force
    expect(cell.velocity!.vx).toBeCloseTo(400);
  });

  test("applies WASD keys (KeyA = left)", () => {
    const cell = engine.spawn({
      position: { x: 10, y: 10 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 10, targetY: 10, strength: 0.08, damping: 0.93 },
    });
    const sys = createMeshInputForceSystem({
      force: 400,
      radius: 200,
      origin: "center",
    });

    engine.keyboard.keys.add("KeyA");
    sys.update(engine, 0.016);

    expect(cell.velocity!.vx).toBeLessThan(0);
  });
});

// ── createMeshTearSystem ─────────────────────────────────────

describe("createMeshTearSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  test("has correct system name", () => {
    const sys = createMeshTearSystem();
    expect(sys.name).toBe("mesh-tear");
  });

  test("destroys cell when displacement exceeds threshold", () => {
    const cell = engine.spawn({
      position: { x: 200, y: 100 }, // 100px away from home on x
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ threshold: 50, particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).not.toContain(cell as any);
  });

  test("does not destroy cell when displacement is below threshold", () => {
    const cell = engine.spawn({
      position: { x: 110, y: 100 }, // 10px from home
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ threshold: 50, particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).toContain(cell as any);
  });

  test("does not destroy cell exactly at threshold (must exceed)", () => {
    const cell = engine.spawn({
      position: { x: 180, y: 100 }, // exactly 80px from home
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ threshold: 80, particles: false });
    sys.update(engine, 0.016);

    // thresholdSq = 6400; distSq = 6400; 6400 > 6400 is false
    expect(engine.world.entities).toContain(cell as any);
  });

  test("uses default threshold of 80 when not specified", () => {
    const justUnder = engine.spawn({
      position: { x: 179, y: 100 }, // ~79px from home
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });
    const justOver = engine.spawn({
      position: { x: 181, y: 100 }, // ~81px from home
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(1, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).toContain(justUnder as any);
    expect(engine.world.entities).not.toContain(justOver as any);
  });

  test("considers diagonal displacement", () => {
    // Diagonal displacement: sqrt(40^2 + 40^2) = ~56.6, which exceeds 50
    const cell = engine.spawn({
      position: { x: 140, y: 140 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ threshold: 50, particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).not.toContain(cell as any);
  });

  test("handles multiple entities with mixed survival", () => {
    const survivor = engine.spawn({
      position: { x: 110, y: 100 }, // 10px displacement
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(0, 0, 2, 2),
    });
    const torn = engine.spawn({
      position: { x: 300, y: 100 }, // 200px displacement
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
      meshCell: meshCell(1, 0, 2, 2),
    });

    const sys = createMeshTearSystem({ threshold: 50, particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).toContain(survivor as any);
    expect(engine.world.entities).not.toContain(torn as any);
  });

  test("does not affect entities without meshCell component", () => {
    const regular = engine.spawn({
      position: { x: 500, y: 500 },
      velocity: { vx: 0, vy: 0 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
    });

    const sys = createMeshTearSystem({ threshold: 10, particles: false });
    sys.update(engine, 0.016);

    expect(engine.world.entities).toContain(regular as any);
  });
});

// ── createMeshPinSystem ──────────────────────────────────────

describe("createMeshPinSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine({ width: 800, height: 600 });
  });

  test("has correct system name", () => {
    const sys = createMeshPinSystem();
    expect(sys.name).toBe("mesh-pin");
  });

  test("pins top row by default (resets position and zeros velocity)", () => {
    const entities = spawnGrid(engine, 3, 3);

    // Displace all entities and give them velocity
    for (const e of entities) {
      e.position!.x += 50;
      e.position!.y += 50;
      e.velocity!.vx = 100;
      e.velocity!.vy = 200;
    }

    const sys = createMeshPinSystem();
    sys.update(engine, 0.016);

    // Top row entities (row=0) should be reset
    for (const e of entities) {
      if (e.meshCell!.row === 0) {
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.position!.y).toBe(e.spring!.targetY);
        expect(e.velocity!.vx).toBe(0);
        expect(e.velocity!.vy).toBe(0);
      } else {
        // Non-top-row entities should remain displaced
        expect(e.velocity!.vx).toBe(100);
        expect(e.velocity!.vy).toBe(200);
      }
    }
  });

  test("pins bottom row", () => {
    const entities = spawnGrid(engine, 3, 3);

    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }

    const sys = createMeshPinSystem({ pin: "bottom" });
    sys.update(engine, 0.016);

    for (const e of entities) {
      if (e.meshCell!.row === 2) {
        // row === rows-1 = 2
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.velocity!.vx).toBe(0);
      } else {
        expect(e.velocity!.vx).toBe(100);
      }
    }
  });

  test("pins left column", () => {
    const entities = spawnGrid(engine, 3, 3);

    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }

    const sys = createMeshPinSystem({ pin: "left" });
    sys.update(engine, 0.016);

    for (const e of entities) {
      if (e.meshCell!.col === 0) {
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.velocity!.vx).toBe(0);
      } else {
        expect(e.velocity!.vx).toBe(100);
      }
    }
  });

  test("pins right column", () => {
    const entities = spawnGrid(engine, 3, 3);

    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }

    const sys = createMeshPinSystem({ pin: "right" });
    sys.update(engine, 0.016);

    for (const e of entities) {
      if (e.meshCell!.col === 2) {
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.velocity!.vx).toBe(0);
      } else {
        expect(e.velocity!.vx).toBe(100);
      }
    }
  });

  test("pins corners only", () => {
    const entities = spawnGrid(engine, 3, 3);

    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }

    const sys = createMeshPinSystem({ pin: "corners" });
    sys.update(engine, 0.016);

    for (const e of entities) {
      const c = e.meshCell!.col;
      const r = e.meshCell!.row;
      const isCorner = (c === 0 || c === 2) && (r === 0 || r === 2);
      if (isCorner) {
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.velocity!.vx).toBe(0);
      } else {
        expect(e.velocity!.vx).toBe(100);
      }
    }
  });

  test("pins with custom function", () => {
    const entities = spawnGrid(engine, 3, 3);

    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }

    // Pin only the center cell
    const sys = createMeshPinSystem({
      pin: (c, r, cols, rows) => c === Math.floor(cols / 2) && r === Math.floor(rows / 2),
    });
    sys.update(engine, 0.016);

    for (const e of entities) {
      const c = e.meshCell!.col;
      const r = e.meshCell!.row;
      if (c === 1 && r === 1) {
        expect(e.position!.x).toBe(e.spring!.targetX);
        expect(e.velocity!.vx).toBe(0);
      } else {
        expect(e.velocity!.vx).toBe(100);
      }
    }
  });

  test("pinned cells stay pinned across multiple ticks", () => {
    const entities = spawnGrid(engine, 2, 2);
    const sys = createMeshPinSystem({ pin: "top" });

    // Tick 1: displace and pin
    for (const e of entities) {
      e.position!.x += 50;
      e.velocity!.vx = 100;
    }
    sys.update(engine, 0.016);

    const topCell = entities.find((e) => e.meshCell!.row === 0);
    expect(topCell!.velocity!.vx).toBe(0);

    // Tick 2: displace again (simulating external force) and re-pin
    topCell!.position!.x += 30;
    topCell!.velocity!.vx = 50;
    sys.update(engine, 0.016);

    expect(topCell!.position!.x).toBe(topCell!.spring!.targetX);
    expect(topCell!.velocity!.vx).toBe(0);
  });

  test("does not affect entities without meshCell component", () => {
    const regular = engine.spawn({
      position: { x: 500, y: 500 },
      velocity: { vx: 100, vy: 100 },
      spring: { targetX: 100, targetY: 100, strength: 0.08, damping: 0.93 },
    });

    const sys = createMeshPinSystem();
    sys.update(engine, 0.016);

    expect(regular.velocity!.vx).toBe(100);
    expect(regular.velocity!.vy).toBe(100);
  });
});
