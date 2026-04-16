import { describe, expect, test } from "bun:test";
import { Camera } from "../../render/camera";

// Helper — build a follow target.
function target(x: number, y: number, vx = 0, vy = 0) {
  return { position: { x, y }, velocity: { vx, vy } };
}

// Run several update steps so the camera has time to converge toward its pan target.
function settle(cam: Camera, steps = 120, dt = 1 / 60) {
  for (let i = 0; i < steps; i++) cam.update(dt);
}

describe("Camera — basic state", () => {
  test("starts at origin with zoom 1 and no target", () => {
    const cam = new Camera();
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    expect(cam.zoom).toBe(1);
    expect(cam.shakeX).toBe(0);
    expect(cam.shakeY).toBe(0);
    expect(cam.followTarget).toBeNull();
    expect(cam.bounds).toBeNull();
  });

  test("setViewport updates viewWidth/viewHeight and aliases", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    expect(cam.viewWidth).toBe(800);
    expect(cam.viewHeight).toBe(600);
    expect(cam.viewportWidth).toBe(800);
    expect(cam.viewportHeight).toBe(600);
  });

  test("moveTo snaps instantly", () => {
    const cam = new Camera();
    cam.moveTo(123, 456);
    expect(cam.x).toBe(123);
    expect(cam.y).toBe(456);
  });
});

describe("Camera — follow(target, opts)", () => {
  test("follow(null) stops following", () => {
    const cam = new Camera();
    cam.follow(target(100, 200));
    expect(cam.followTarget).not.toBeNull();

    cam.follow(null);
    expect(cam.followTarget).toBeNull();

    // After stop, update() should not pan the camera toward the old target.
    const prevX = cam.x;
    const prevY = cam.y;
    cam.update(1 / 60);
    expect(cam.x).toBe(prevX);
    expect(cam.y).toBe(prevY);
  });

  test("stores follow options", () => {
    const cam = new Camera();
    const t = target(50, 50);
    cam.follow(t, { smoothing: 0.25, lookahead: 0.3 });
    expect(cam.followTarget).toBe(t);
    expect(cam.followOpts.smoothing).toBe(0.25);
    expect(cam.followOpts.lookahead).toBe(0.3);
  });

  test("update() lerps toward the target", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    cam.follow(target(500, 300), { smoothing: 0.1 });

    // One frame should move part of the way (not all the way, not zero).
    cam.update(1 / 60);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(500);
    expect(cam.y).toBeGreaterThan(0);
    expect(cam.y).toBeLessThan(300);

    // After enough steps, camera should converge on the target.
    settle(cam);
    expect(cam.x).toBeCloseTo(500, 0);
    expect(cam.y).toBeCloseTo(300, 0);
  });

  test("smoothing of 1 snaps instantly in a single step", () => {
    const cam = new Camera();
    cam.follow(target(250, 150), { smoothing: 1 });
    cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(250, 5);
    expect(cam.y).toBeCloseTo(150, 5);
  });

  test("offset shifts where the camera sits relative to the target", () => {
    const cam = new Camera();
    cam.follow(target(100, 100), { smoothing: 1, offset: { x: 40, y: -20 } });
    cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(140, 5);
    expect(cam.y).toBeCloseTo(80, 5);
  });
});

describe("Camera — deadzone", () => {
  test("no camera movement while target is inside the deadzone", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    // Deadzone 200x200 means target within 100px of camera center should not move camera.
    cam.follow(target(50, -30), {
      smoothing: 1,
      deadzone: { width: 200, height: 200 },
    });
    settle(cam, 10);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  test("camera moves when target exits the deadzone horizontally", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    cam.follow(target(300, 0), {
      smoothing: 1,
      deadzone: { width: 200, height: 200 },
    });
    settle(cam);
    // Target at 300, deadzone half-width = 100. Camera should settle at 300 - 100 = 200.
    expect(cam.x).toBeCloseTo(200, 0);
    expect(cam.y).toBeCloseTo(0, 5);
  });

  test("camera moves when target exits the deadzone vertically", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    cam.follow(target(0, -250), {
      smoothing: 1,
      deadzone: { width: 200, height: 200 },
    });
    settle(cam);
    // Target at -250, deadzone half-height = 100. Camera should settle at -250 + 100 = -150.
    expect(cam.y).toBeCloseTo(-150, 0);
    expect(cam.x).toBeCloseTo(0, 5);
  });

  test("deadzone edge hold: target moving further past edge pushes camera", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    const t = target(150, 0); // 50 past deadzone right edge
    cam.follow(t, { smoothing: 1, deadzone: { width: 200, height: 200 } });
    settle(cam);
    expect(cam.x).toBeCloseTo(50, 0);

    // Move target further; camera should follow the edge.
    t.position.x = 400;
    settle(cam);
    expect(cam.x).toBeCloseTo(300, 0);
  });
});

describe("Camera — lookahead", () => {
  test("lookahead adds velocity * factor to the target", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    // Target sits at origin but moves right at 200 units/sec. Lookahead 0.5 → +100 ahead.
    cam.follow(target(0, 0, 200, 0), { smoothing: 1, lookahead: 0.5 });
    settle(cam);
    expect(cam.x).toBeCloseTo(100, 0);
    expect(cam.y).toBeCloseTo(0, 5);
  });

  test("lookahead works with both axes", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    cam.follow(target(10, 20, 100, -50), { smoothing: 1, lookahead: 0.2 });
    settle(cam);
    // target + velocity*0.2 = (10 + 20, 20 - 10) = (30, 10)
    expect(cam.x).toBeCloseTo(30, 0);
    expect(cam.y).toBeCloseTo(10, 0);
  });

  test("lookahead has no effect when target has no velocity", () => {
    const cam = new Camera();
    cam.moveTo(0, 0);
    // Target without a velocity component.
    const t: any = { position: { x: 200, y: 100 } };
    cam.follow(t, { smoothing: 1, lookahead: 5 });
    settle(cam);
    expect(cam.x).toBeCloseTo(200, 0);
    expect(cam.y).toBeCloseTo(100, 0);
  });
});

describe("Camera — bounds", () => {
  test("setBounds stores and clears", () => {
    const cam = new Camera();
    const b = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    cam.setBounds(b);
    expect(cam.bounds).toBe(b);
    cam.setBounds(null);
    expect(cam.bounds).toBeNull();
  });

  test("clamps camera so viewport stays within bounds — right edge", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.setBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 800 });
    // Try to push far to the right — camera should clamp so viewport right edge = bounds.maxX
    cam.follow(target(10_000, 400), { smoothing: 1 });
    settle(cam);
    // halfW = 400 with zoom=1 → max camera x = 1000 - 400 = 600
    expect(cam.x).toBeCloseTo(600, 0);
  });

  test("clamps camera so viewport stays within bounds — left edge", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1600 });
    cam.follow(target(-500, 800), { smoothing: 1 });
    settle(cam);
    // min camera x = 0 + 400 = 400
    expect(cam.x).toBeCloseTo(400, 0);
  });

  test("clamps camera — bottom edge", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1200 });
    cam.follow(target(1000, 9999), { smoothing: 1 });
    settle(cam);
    // halfH = 300 with zoom=1 → max camera y = 1200 - 300 = 900
    expect(cam.y).toBeCloseTo(900, 0);
  });

  test("respects viewport size — smaller viewport allows camera further to edges", () => {
    const camBig = new Camera();
    camBig.setViewport(800, 600);
    camBig.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1600 });
    camBig.follow(target(5000, 800), { smoothing: 1 });
    settle(camBig);

    const camSmall = new Camera();
    camSmall.setViewport(400, 300);
    camSmall.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1600 });
    camSmall.follow(target(5000, 800), { smoothing: 1 });
    settle(camSmall);

    // Smaller viewport → can sit further right (halfW = 200 vs 400)
    expect(camSmall.x).toBeGreaterThan(camBig.x);
    expect(camBig.x).toBeCloseTo(1600, 0); // 2000 - 400
    expect(camSmall.x).toBeCloseTo(1800, 0); // 2000 - 200
  });

  test("centers on bounds when bounds are smaller than viewport", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.setBounds({ minX: 0, minY: 0, maxX: 500, maxY: 400 });
    cam.follow(target(9999, 9999), { smoothing: 1 });
    settle(cam);
    // Bounds center: (250, 200)
    expect(cam.x).toBeCloseTo(250, 0);
    expect(cam.y).toBeCloseTo(200, 0);
  });
});

describe("Camera — worldToScreen / screenToWorld", () => {
  test("round-trip with zoom 1, no shake", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.moveTo(400, 300);
    const world = { x: 123, y: 456 };
    const screen = cam.worldToScreen(world.x, world.y);
    const back = cam.screenToWorld(screen.x, screen.y);
    expect(back.x).toBeCloseTo(world.x, 5);
    expect(back.y).toBeCloseTo(world.y, 5);
  });

  test("world center maps to screen center when camera is centered", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.moveTo(100, 50);
    const s = cam.worldToScreen(100, 50);
    expect(s.x).toBeCloseTo(400, 5);
    expect(s.y).toBeCloseTo(300, 5);
  });

  test("round-trip with non-unit zoom", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.moveTo(200, 100);
    cam.zoom = 2;
    const world = { x: 250, y: 120 };
    const s = cam.worldToScreen(world.x, world.y);
    const back = cam.screenToWorld(s.x, s.y);
    expect(back.x).toBeCloseTo(world.x, 5);
    expect(back.y).toBeCloseTo(world.y, 5);
  });

  test("round-trip includes shake offset", () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.moveTo(0, 0);
    // Inject a deterministic shake offset.
    cam.shakeX = 12;
    cam.shakeY = -7;
    const world = { x: 50, y: 25 };
    const s = cam.worldToScreen(world.x, world.y);
    const back = cam.screenToWorld(s.x, s.y);
    expect(back.x).toBeCloseTo(world.x, 5);
    expect(back.y).toBeCloseTo(world.y, 5);
  });
});

describe("Camera — shake", () => {
  test("shake() produces non-zero offsets and decays to zero", () => {
    const cam = new Camera();
    cam.shake(10);
    cam.update(1 / 60);
    const firstX = cam.shakeX;
    const firstY = cam.shakeY;
    // Shake should produce offsets within magnitude bounds.
    expect(Math.abs(firstX)).toBeLessThanOrEqual(10);
    expect(Math.abs(firstY)).toBeLessThanOrEqual(10);
    expect(Math.abs(firstX) + Math.abs(firstY)).toBeGreaterThan(0);

    // After many frames, shake should decay below threshold and clear.
    for (let i = 0; i < 300; i++) cam.update(1 / 60);
    expect(cam.shakeX).toBe(0);
    expect(cam.shakeY).toBe(0);
  });

  test("shake coexists with follow — follow still converges", () => {
    const cam = new Camera();
    cam.follow(target(500, 300), { smoothing: 1 });
    cam.shake(8);
    settle(cam, 300);
    expect(cam.x).toBeCloseTo(500, 0);
    expect(cam.y).toBeCloseTo(300, 0);
    expect(cam.shakeX).toBe(0);
    expect(cam.shakeY).toBe(0);
  });
});

describe("Camera — legacy follow(x, y, smoothing) signature", () => {
  test("still works as a pan target", () => {
    const cam = new Camera();
    cam.follow(400, 300, 1);
    cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(400, 0);
    expect(cam.y).toBeCloseTo(300, 0);
    expect(cam.followTarget).toBeNull();
  });
});
