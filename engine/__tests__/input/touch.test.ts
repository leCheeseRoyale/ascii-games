/**
 * Tests for Touch — unified pointer/touch/mouse input + gesture recognition.
 *
 * We cannot rely on real DOM globals in Bun's test runtime, so these tests
 * build a MockCanvas that records `addEventListener` calls. Tests drive the
 * recorded handlers directly with plain event-shaped objects.
 *
 * Time is mocked by replacing globalThis.performance.now so we can simulate
 * durations for gesture recognition (tap / swipe).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Touch } from "../../input/touch";

// ── Mocks ────────────────────────────────────────────────────────

interface Registered {
  type: string;
  handler: (e: unknown) => void;
}

class MockCanvas {
  listeners: Registered[] = [];
  // Rect returned by getBoundingClientRect — lets us simulate canvas offset.
  rect = { left: 0, top: 0, width: 800, height: 600 };
  // Canvas backing-store size. Equal to rect by default so tests without
  // CSS scaling see 1:1 coordinates.
  width = 800;
  height = 600;

  addEventListener(type: string, handler: (e: unknown) => void): void {
    this.listeners.push({ type, handler });
  }
  removeEventListener(type: string, handler: (e: unknown) => void): void {
    const i = this.listeners.findIndex((l) => l.type === type && l.handler === handler);
    if (i >= 0) this.listeners.splice(i, 1);
  }
  getBoundingClientRect() {
    return this.rect;
  }

  /** Fire every handler registered for a given event type. */
  fire(type: string, event: Record<string, unknown>): void {
    // Allow handler to call preventDefault() — no-op by default.
    const e: Record<string, unknown> = { preventDefault: () => {}, ...event };
    for (const l of this.listeners.filter((x) => x.type === type)) {
      l.handler(e);
    }
  }
}

// ── Time mocking ─────────────────────────────────────────────────

let nowMs = 1000;
const origPerf = (globalThis as { performance?: { now?: () => number } }).performance;

beforeEach(() => {
  nowMs = 1000;
  (globalThis as { performance: { now: () => number } }).performance = { now: () => nowMs };
});
afterEach(() => {
  if (origPerf) {
    (globalThis as { performance?: unknown }).performance = origPerf;
  } else {
    delete (globalThis as { performance?: unknown }).performance;
  }
});

function advance(ms: number): void {
  nowMs += ms;
}

// ── Helpers ──────────────────────────────────────────────────────

function setup(opts?: ConstructorParameters<typeof Touch>[1]) {
  const canvas = new MockCanvas();
  // Provide a minimal `window` stub so unifyMouse installs mouseup on window.
  (globalThis as { window?: unknown }).window = canvas; // reuse canvas for listener recording
  const touch = new Touch(canvas, opts);
  return { canvas, touch };
}

// ── Tests ────────────────────────────────────────────────────────

describe("Touch — construction / listeners", () => {
  test("registers pointer / touch / mouse listeners on canvas", () => {
    const { canvas } = setup();
    const types = canvas.listeners.map((l) => l.type);
    expect(types).toContain("pointerdown");
    expect(types).toContain("pointermove");
    expect(types).toContain("pointerup");
    expect(types).toContain("pointercancel");
    expect(types).toContain("touchstart");
    expect(types).toContain("touchmove");
    expect(types).toContain("touchend");
    expect(types).toContain("touchcancel");
    expect(types).toContain("mousedown");
    expect(types).toContain("mousemove");
    expect(types).toContain("mouseup");
  });

  test("does not install mouse listeners when unifyMouse=false", () => {
    const { canvas } = setup({ unifyMouse: false });
    const types = canvas.listeners.map((l) => l.type);
    expect(types).not.toContain("mousedown");
    expect(types).not.toContain("mousemove");
    expect(types).not.toContain("mouseup");
  });

  test("scales touch coordinates when canvas is CSS-scaled", () => {
    const { canvas, touch } = setup();
    canvas.rect = { left: 0, top: 0, width: 400, height: 300 }; // displayed half-size
    canvas.width = 800;
    canvas.height = 600;
    canvas.fire("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 75 });
    const t = touch.primary!;
    expect(t.x).toBe(200);
    expect(t.y).toBe(150);
  });

  test("destroy() removes every listener", () => {
    const { canvas, touch } = setup();
    const before = canvas.listeners.length;
    expect(before).toBeGreaterThan(0);
    touch.destroy();
    expect(canvas.listeners.length).toBe(0);
  });

  test("destroy() is idempotent", () => {
    const { touch } = setup();
    touch.destroy();
    expect(() => touch.destroy()).not.toThrow();
  });
});

describe("Touch — pointer events populate touches", () => {
  test("pointerdown adds a touch with correct id/x/y", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 7, clientX: 123, clientY: 45 });
    touch.update();
    expect(touch.touches.length).toBe(1);
    const p = touch.touches[0];
    expect(p.id).toBe(7);
    expect(p.x).toBe(123);
    expect(p.y).toBe(45);
    expect(p.startX).toBe(123);
    expect(p.startY).toBe(45);
    expect(p.dx).toBe(0);
    expect(p.dy).toBe(0);
  });

  test("pointermove updates x/y/dx/dy but keeps startX/startY", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 130, clientY: 120 });
    touch.update();
    const p = touch.touches[0];
    expect(p.x).toBe(130);
    expect(p.y).toBe(120);
    expect(p.startX).toBe(100);
    expect(p.startY).toBe(100);
    expect(p.dx).toBe(30);
    expect(p.dy).toBe(20);
  });

  test("pointerup removes the touch after update()", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    touch.update();
    expect(touch.touches.length).toBe(0);
  });

  test("multiple simultaneous touches are tracked separately by id", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 200, clientY: 300 });
    touch.update();
    expect(touch.touches.length).toBe(2);
    const a = touch.touches.find((t) => t.id === 1);
    const b = touch.touches.find((t) => t.id === 2);
    expect(a?.x).toBe(10);
    expect(b?.x).toBe(200);
  });

  test("subtracts canvas offset via getBoundingClientRect", () => {
    const { canvas, touch } = setup();
    canvas.rect = { left: 50, top: 25, width: 800, height: 600 };
    canvas.fire("pointerdown", { pointerId: 1, clientX: 150, clientY: 75 });
    touch.update();
    expect(touch.touches[0].x).toBe(100);
    expect(touch.touches[0].y).toBe(50);
  });
});

describe("Touch — touch events", () => {
  test("touchstart adds touch via changedTouches", () => {
    const { canvas, touch } = setup();
    canvas.fire("touchstart", {
      changedTouches: [{ identifier: 42, clientX: 60, clientY: 70 }],
      touches: [{ identifier: 42, clientX: 60, clientY: 70 }],
    });
    touch.update();
    expect(touch.touches.length).toBe(1);
    expect(touch.touches[0].id).toBe(42);
    expect(touch.touches[0].x).toBe(60);
    expect(touch.touches[0].y).toBe(70);
  });

  test("touchend removes the touch", () => {
    const { canvas, touch } = setup();
    canvas.fire("touchstart", {
      changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }],
    });
    canvas.fire("touchend", {
      changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }],
    });
    touch.update();
    expect(touch.touches.length).toBe(0);
  });

  test("touchcancel marks touch cancel and removes on update", () => {
    const { canvas, touch } = setup();
    const ended: number[] = [];
    touch.onEnd((t) => ended.push(t.id));
    canvas.fire("touchstart", {
      changedTouches: [{ identifier: 5, clientX: 0, clientY: 0 }],
    });
    canvas.fire("touchcancel", {
      changedTouches: [{ identifier: 5, clientX: 0, clientY: 0 }],
    });
    touch.update();
    expect(touch.touches.length).toBe(0);
    expect(ended).toEqual([5]);
  });
});

describe("Touch — gesture recognition", () => {
  test("tap: quick begin/end in same spot fires onTap", () => {
    const { canvas, touch } = setup();
    const taps: unknown[] = [];
    touch.onTap((g) => taps.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    advance(100);
    canvas.fire("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    expect(taps.length).toBe(1);
    const g = taps[0] as { type: string; x: number; y: number; duration: number };
    expect(g.type).toBe("tap");
    expect(g.x).toBe(100);
    expect(g.y).toBe(100);
    expect(g.duration).toBeCloseTo(100, 5);
  });

  test("not a tap if duration exceeds tapMaxDuration", () => {
    const { canvas, touch } = setup({ tapMaxDuration: 300 });
    const taps: unknown[] = [];
    touch.onTap((g) => taps.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    advance(400);
    canvas.fire("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    expect(taps.length).toBe(0);
  });

  test("not a tap if moved more than dragThreshold", () => {
    const { canvas, touch } = setup({ dragThreshold: 10 });
    const taps: unknown[] = [];
    touch.onTap((g) => taps.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 120, clientY: 100 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 1, clientX: 120, clientY: 100 });
    expect(taps.length).toBe(0);
  });

  test("swipe right: fast horizontal movement fires onSwipe with direction=right", () => {
    const { canvas, touch } = setup();
    const swipes: unknown[] = [];
    touch.onSwipe((g) => swipes.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 200, clientY: 100 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 1, clientX: 200, clientY: 100 });
    expect(swipes.length).toBe(1);
    const g = swipes[0] as { direction: string; dx: number; dy: number; distance: number };
    expect(g.direction).toBe("right");
    expect(g.dx).toBe(100);
    expect(g.distance).toBeCloseTo(100, 3);
  });

  test("swipe left / up / down directions inferred correctly", () => {
    const dirs: Record<string, string> = {};
    const { canvas: c1, touch: t1 } = setup();
    t1.onSwipe((g) => {
      dirs.left = g.direction;
    });
    c1.fire("pointerdown", { pointerId: 1, clientX: 300, clientY: 100 });
    c1.fire("pointermove", { pointerId: 1, clientX: 200, clientY: 100 });
    advance(50);
    c1.fire("pointerup", { pointerId: 1, clientX: 200, clientY: 100 });

    const { canvas: c2, touch: t2 } = setup();
    t2.onSwipe((g) => {
      dirs.up = g.direction;
    });
    c2.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 200 });
    c2.fire("pointermove", { pointerId: 1, clientX: 100, clientY: 100 });
    advance(50);
    c2.fire("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });

    const { canvas: c3, touch: t3 } = setup();
    t3.onSwipe((g) => {
      dirs.down = g.direction;
    });
    c3.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    c3.fire("pointermove", { pointerId: 1, clientX: 100, clientY: 200 });
    advance(50);
    c3.fire("pointerup", { pointerId: 1, clientX: 100, clientY: 200 });

    expect(dirs.left).toBe("left");
    expect(dirs.up).toBe("up");
    expect(dirs.down).toBe("down");
  });

  test("no swipe when velocity below swipeMinVelocity", () => {
    const { canvas, touch } = setup({ swipeMinVelocity: 0.5 });
    const swipes: unknown[] = [];
    touch.onSwipe((g) => swipes.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 150, clientY: 100 });
    advance(2000); // 50px over 2000ms = 0.025 px/ms → below threshold
    canvas.fire("pointerup", { pointerId: 1, clientX: 150, clientY: 100 });
    expect(swipes.length).toBe(0);
  });

  test("pinch: two fingers moving apart fires onPinch with scale > 1", () => {
    const { canvas, touch } = setup();
    const pinches: Array<{ scale: number; centerX: number; centerY: number }> = [];
    touch.onPinch((g) => pinches.push(g));
    // Two touches, 100px apart initially.
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 200, clientY: 100 });
    // Move apart to 200px.
    canvas.fire("pointermove", { pointerId: 2, clientX: 300, clientY: 100 });
    expect(pinches.length).toBeGreaterThan(0);
    const last = pinches[pinches.length - 1];
    expect(last.scale).toBeCloseTo(2, 2);
    expect(last.centerX).toBeCloseTo(200, 5);
  });

  test("pinch: two fingers moving together fires onPinch with scale < 1", () => {
    const { canvas, touch } = setup();
    const pinches: Array<{ scale: number }> = [];
    touch.onPinch((g) => pinches.push(g));
    canvas.fire("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 300, clientY: 100 });
    canvas.fire("pointermove", { pointerId: 2, clientX: 200, clientY: 100 });
    expect(pinches.length).toBeGreaterThan(0);
    expect(pinches[pinches.length - 1].scale).toBeCloseTo(0.5, 2);
  });
});

describe("Touch — mouse unification", () => {
  test("mouse events create touches when unifyMouse=true", () => {
    const { canvas, touch } = setup({ unifyMouse: true });
    canvas.fire("mousedown", { clientX: 50, clientY: 60 });
    touch.update();
    expect(touch.touches.length).toBe(1);
    expect(touch.touches[0].x).toBe(50);
  });

  test("mouse move updates position while button held", () => {
    const { canvas, touch } = setup();
    canvas.fire("mousedown", { clientX: 50, clientY: 60 });
    canvas.fire("mousemove", { clientX: 90, clientY: 80 });
    touch.update();
    expect(touch.touches[0].x).toBe(90);
    expect(touch.touches[0].y).toBe(80);
  });

  test("mouse move without button held is ignored", () => {
    const { canvas, touch } = setup();
    canvas.fire("mousemove", { clientX: 90, clientY: 80 });
    touch.update();
    expect(touch.touches.length).toBe(0);
  });

  test("mouseup ends the synthetic touch", () => {
    const { canvas, touch } = setup();
    canvas.fire("mousedown", { clientX: 10, clientY: 10 });
    canvas.fire("mouseup", { clientX: 10, clientY: 10 });
    touch.update();
    expect(touch.touches.length).toBe(0);
  });

  test("tap gesture fires from mouse click", () => {
    const { canvas, touch } = setup();
    const taps: unknown[] = [];
    touch.onTap((g) => taps.push(g));
    canvas.fire("mousedown", { clientX: 42, clientY: 42 });
    advance(80);
    canvas.fire("mouseup", { clientX: 42, clientY: 42 });
    expect(taps.length).toBe(1);
  });
});

describe("Touch — primary / find / phases", () => {
  test("primary returns first active touch", () => {
    const { canvas, touch } = setup();
    expect(touch.primary).toBeNull();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 20, clientY: 20 });
    const p = touch.primary;
    expect(p).not.toBeNull();
    expect(p?.id).toBe(1);
  });

  test("find() returns a snapshot for an active touch, null otherwise", () => {
    const { canvas, touch } = setup();
    expect(touch.find(99)).toBeNull();
    canvas.fire("pointerdown", { pointerId: 99, clientX: 7, clientY: 8 });
    expect(touch.find(99)?.x).toBe(7);
  });

  test("touch phase transitions begin → active after update()", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    expect(touch.primary?.phase).toBe("begin");
    touch.update();
    expect(touch.primary?.phase).toBe("active");
  });
});

describe("Touch — event subscriptions", () => {
  test("onBegin fires exactly once per new touch", () => {
    const { canvas, touch } = setup();
    let count = 0;
    touch.onBegin(() => count++);
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 0, clientY: 0 });
    expect(count).toBe(2);
  });

  test("onMove fires on each pointer move", () => {
    const { canvas, touch } = setup();
    let count = 0;
    touch.onMove(() => count++);
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 10, clientY: 0 });
    canvas.fire("pointermove", { pointerId: 1, clientX: 20, clientY: 0 });
    expect(count).toBe(2);
  });

  test("onEnd fires on release and on cancel", () => {
    const { canvas, touch } = setup();
    let count = 0;
    touch.onEnd(() => count++);
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    canvas.fire("pointerup", { pointerId: 1, clientX: 0, clientY: 0 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 0, clientY: 0 });
    canvas.fire("pointercancel", { pointerId: 2, clientX: 0, clientY: 0 });
    expect(count).toBe(2);
  });

  test("unsubscribe returned by onTap removes the handler", () => {
    const { canvas, touch } = setup();
    let count = 0;
    const off = touch.onTap(() => count++);
    canvas.fire("pointerdown", { pointerId: 1, clientX: 5, clientY: 5 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 1, clientX: 5, clientY: 5 });
    expect(count).toBe(1);

    off();
    canvas.fire("pointerdown", { pointerId: 2, clientX: 5, clientY: 5 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 2, clientX: 5, clientY: 5 });
    expect(count).toBe(1);
  });
});

describe("Touch — frame update / gesture queue", () => {
  test("gestures array contains the recognized tap until update() is called", () => {
    const { canvas, touch } = setup();
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 1, clientX: 0, clientY: 0 });
    expect(touch.gestures.length).toBe(1);
    expect(touch.gestures[0].type).toBe("tap");
    touch.update();
    expect(touch.gestures.length).toBe(0);
  });

  test("multiple gestures in one frame all reported", () => {
    const { canvas, touch } = setup();
    // Two taps via two pointers.
    canvas.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 1, clientX: 0, clientY: 0 });
    canvas.fire("pointerdown", { pointerId: 2, clientX: 50, clientY: 50 });
    advance(50);
    canvas.fire("pointerup", { pointerId: 2, clientX: 50, clientY: 50 });
    expect(touch.gestures.length).toBe(2);
  });
});

describe("Touch — preventDefault", () => {
  test("pointerdown calls preventDefault to suppress browser scroll/zoom", () => {
    const { canvas } = setup();
    let called = false;
    canvas.fire("pointerdown", {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        called = true;
      },
    });
    expect(called).toBe(true);
  });

  test("touchstart calls preventDefault", () => {
    const { canvas } = setup();
    let called = false;
    canvas.fire("touchstart", {
      changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }],
      preventDefault: () => {
        called = true;
      },
    });
    expect(called).toBe(true);
  });
});
