/**
 * Tests for VirtualJoystick and VirtualDpad.
 *
 * We use a MockTouch that exposes a synthetic `touches` array matching the
 * minimal shape of Touch (id, x, y, phase, etc.), and a MockCanvas2DContext
 * that stubs the methods used by render().
 */

import { describe, expect, test } from "bun:test";
import type { TouchPoint } from "../../input/touch";
import { VirtualDpad, VirtualJoystick } from "../../render/virtual-controls";

// ── Mocks ────────────────────────────────────────────────────────

class MockTouch {
  touches: TouchPoint[] = [];

  set(points: Array<Partial<TouchPoint> & { x: number; y: number; id?: number }>): void {
    this.touches = points.map((p, i) => ({
      id: p.id ?? i,
      x: p.x,
      y: p.y,
      startX: p.startX ?? p.x,
      startY: p.startY ?? p.y,
      dx: p.dx ?? 0,
      dy: p.dy ?? 0,
      startTime: p.startTime ?? 0,
      phase: p.phase ?? "active",
    }));
  }

  clear(): void {
    this.touches = [];
  }
}

/** A lightweight stub of CanvasRenderingContext2D — only the methods used by render. */
function makeCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ method: name, args });
    };
  const ctx = {
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    arc: record("arc"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    fillText: record("fillText"),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

// ── Fixtures ─────────────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 600;

// Anchor "bottomLeft" with default padding=80 → center at (80, 520).
const BL = { x: 80, y: 520 };

// ── VirtualJoystick tests ────────────────────────────────────────

describe("VirtualJoystick — construction & defaults", () => {
  test("constructs without throwing", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    expect(stick.x).toBe(0);
    expect(stick.y).toBe(0);
    expect(stick.magnitude).toBe(0);
    expect(stick.active).toBe(false);
  });

  test("render() does not throw with no touches", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    const { ctx } = makeCtx();
    expect(() => stick.render(ctx, CANVAS_W, CANVAS_H)).not.toThrow();
  });

  test("render() visibleOnlyOnTouch=true skips drawing when inactive", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, visibleOnlyOnTouch: true });
    const { ctx, calls } = makeCtx();
    stick.render(ctx, CANVAS_W, CANVAS_H);
    expect(calls.length).toBe(0);
  });

  test("render() visibleOnlyOnTouch=false draws even when inactive", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, visibleOnlyOnTouch: false });
    const { ctx, calls } = makeCtx();
    stick.render(ctx, CANVAS_W, CANVAS_H);
    expect(calls.some((c) => c.method === "arc")).toBe(true);
  });
});

describe("VirtualJoystick — activation & tracking", () => {
  test("touch inside radius activates stick", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    touch.set([{ x: BL.x, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(true);
  });

  test("touch outside radius does not activate", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60 });
    // Far from center — 400px away.
    touch.set([{ x: BL.x + 400, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(false);
  });

  test("reports x > 0 when thumb pushed right", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60, deadzone: 0 });
    touch.set([{ x: BL.x + 60, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.x).toBeCloseTo(1, 2);
    expect(stick.y).toBeCloseTo(0, 2);
  });

  test("reports y > 0 when thumb pushed down", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60, deadzone: 0 });
    touch.set([{ x: BL.x, y: BL.y + 60 }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.y).toBeCloseTo(1, 2);
  });

  test("deadzone: small displacement returns 0,0", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60, deadzone: 0.2 });
    // 5 px out of 60 = 0.083 < 0.2 deadzone.
    touch.set([{ x: BL.x + 5, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.x).toBe(0);
    expect(stick.y).toBe(0);
    expect(stick.magnitude).toBe(0);
  });

  test("magnitude clamped to 1 even when touch drags past the edge", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60, deadzone: 0 });
    // Start inside the ring to acquire the touch…
    touch.set([{ x: BL.x, y: BL.y, id: 1 }]);
    stick.update(CANVAS_W, CANVAS_H);
    // …then drag far past the edge with the same id.
    touch.set([{ x: BL.x + 200, y: BL.y, id: 1 }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.magnitude).toBeCloseTo(1, 2);
    expect(stick.x).toBeCloseTo(1, 2);
  });

  test("releasing touch resets to inactive", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, deadzone: 0 });
    touch.set([{ x: BL.x + 30, y: BL.y + 30, id: 7 }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(true);
    // Remove touch.
    touch.clear();
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(false);
    expect(stick.x).toBe(0);
    expect(stick.y).toBe(0);
  });

  test("phase=end touch is ignored for acquisition", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    touch.set([{ x: BL.x, y: BL.y, phase: "end" }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(false);
  });

  test("direction reports radians (0 = right, pi/2 = down)", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch, size: 60, deadzone: 0 });

    touch.set([{ x: BL.x + 60, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.direction).toBeCloseTo(0, 2);

    touch.set([{ x: BL.x, y: BL.y + 60 }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.direction).toBeCloseTo(Math.PI / 2, 2);
  });

  test("render() when active draws the ring and thumb", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    touch.set([{ x: BL.x, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    const { ctx, calls } = makeCtx();
    stick.render(ctx, CANVAS_W, CANVAS_H);
    // Should call arc() twice — once for ring, once for thumb — and stroke/fill.
    const arcCount = calls.filter((c) => c.method === "arc").length;
    expect(arcCount).toBe(2);
  });

  test("custom {x,y} anchor is respected", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({
      anchor: { x: 400, y: 300 },
      touch,
      size: 60,
      deadzone: 0,
    });
    touch.set([{ x: 460, y: 300 }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(true);
    expect(stick.x).toBeCloseTo(1, 2);
  });

  test("destroy() clears active state", () => {
    const touch = new MockTouch();
    const stick = new VirtualJoystick({ anchor: "bottomLeft", touch });
    touch.set([{ x: BL.x, y: BL.y }]);
    stick.update(CANVAS_W, CANVAS_H);
    expect(stick.active).toBe(true);
    stick.destroy();
    expect(stick.active).toBe(false);
  });
});

// ── VirtualDpad tests ────────────────────────────────────────────

describe("VirtualDpad — construction & defaults", () => {
  test("constructs with all buttons unpressed", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    expect(dpad.up).toBe(false);
    expect(dpad.down).toBe(false);
    expect(dpad.left).toBe(false);
    expect(dpad.right).toBe(false);
  });

  test("render() does not throw with no touches", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    const { ctx } = makeCtx();
    expect(() => dpad.render(ctx, CANVAS_W, CANVAS_H)).not.toThrow();
  });

  test("visibleOnlyOnTouch=true hides when inactive", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch, visibleOnlyOnTouch: true });
    const { ctx, calls } = makeCtx();
    dpad.render(ctx, CANVAS_W, CANVAS_H);
    expect(calls.length).toBe(0);
  });

  test("visibleOnlyOnTouch=false shows when inactive", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch, visibleOnlyOnTouch: false });
    const { ctx, calls } = makeCtx();
    dpad.render(ctx, CANVAS_W, CANVAS_H);
    expect(calls.some((c) => c.method === "fillRect")).toBe(true);
  });
});

describe("VirtualDpad — button press detection", () => {
  // Default size=120, buttonSize=40. Center at BL = (80, 520).
  // 'up' button center:    (80, 520 - 60 + 20) = (80, 480)
  // 'down' button center:  (80, 520 + 60 - 20) = (80, 580)
  // 'left' button center:  (80 - 60 + 20, 520) = (40, 520)
  // 'right' button center: (80 + 60 - 20, 520) = (140, 520)

  test("touch in up-button area sets up=true", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 80, y: 480 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.up).toBe(true);
    expect(dpad.down).toBe(false);
  });

  test("touch in down-button area sets down=true", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 80, y: 580 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.down).toBe(true);
  });

  test("touch in left-button area sets left=true", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 40, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.left).toBe(true);
  });

  test("touch in right-button area sets right=true", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 140, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(true);
  });

  test("touch in center (no button) leaves all flags false", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 80, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.up).toBe(false);
    expect(dpad.down).toBe(false);
    expect(dpad.left).toBe(false);
    expect(dpad.right).toBe(false);
  });

  test("multiple simultaneous touches press multiple buttons", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([
      { x: 140, y: 520, id: 1 }, // right
      { x: 80, y: 480, id: 2 }, // up
    ]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(true);
    expect(dpad.up).toBe(true);
    expect(dpad.down).toBe(false);
    expect(dpad.left).toBe(false);
  });

  test("releasing a touch deactivates that button on next update", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 140, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(true);

    touch.clear();
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(false);
  });

  test("phase=end touches are ignored", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 140, y: 520, phase: "end" }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(false);
  });

  test("render when a button is pressed calls fillRect for each of the 4 buttons", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 140, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    const { ctx, calls } = makeCtx();
    dpad.render(ctx, CANVAS_W, CANVAS_H);
    const fillCount = calls.filter((c) => c.method === "fillRect").length;
    expect(fillCount).toBe(4);
  });

  test("custom anchor object works", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: { x: 400, y: 300 }, touch });
    // 'right' button center: (400 + 40, 300) = (440, 300)
    touch.set([{ x: 440, y: 300 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(true);
  });

  test("destroy() clears all button flags", () => {
    const touch = new MockTouch();
    const dpad = new VirtualDpad({ anchor: "bottomLeft", touch });
    touch.set([{ x: 140, y: 520 }]);
    dpad.update(CANVAS_W, CANVAS_H);
    expect(dpad.right).toBe(true);
    dpad.destroy();
    expect(dpad.right).toBe(false);
    expect(dpad.up).toBe(false);
    expect(dpad.down).toBe(false);
    expect(dpad.left).toBe(false);
  });
});
