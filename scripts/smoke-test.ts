/**
 * Headless smoke test — instantiate the engine without a canvas,
 * call setupGame, tick 60 frames, and check for runtime errors.
 */

export async function smokeTest(): Promise<void> {
  console.log("\nRunning headless smoke test (60 frames)...");

  // Stub browser APIs that libraries reference at import time.
  const g = globalThis as Record<string, unknown>;
  if (!g.AudioContext) {
    g.AudioContext = class {
      createGain() { return { connect() {}, gain: { value: 0 } }; }
      get destination() { return {}; }
    };
  }
  if (!g.document) {
    const stubCtx = () => ({
      font: "",
      fillStyle: "",
      strokeStyle: "",
      globalAlpha: 1,
      textBaseline: "alphabetic",
      textAlign: "left",
      lineWidth: 1,
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      clearRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      measureText: (t: string) => ({ width: t.length * 8 }),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      closePath: () => {},
      setTransform: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      drawImage: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
    });
    const stubEl = () => ({
      getContext: () => stubCtx(),
      style: {},
      width: 800,
      height: 600,
      appendChild: () => {},
      removeChild: () => {},
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 800, height: 600, top: 0, left: 0 }),
      addEventListener: () => {},
      removeEventListener: () => {},
      remove: () => {},
    });
    g.document = { createElement: stubEl, body: { appendChild: () => {}, removeChild: () => {} } };
  }
  if (!g.window) {
    g.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 800,
      innerHeight: 600,
    };
  }
  if (!g.requestAnimationFrame) {
    g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }

  const { Engine } = await import("../engine/core/engine");

  let setupGameFn: (engine: typeof Engine.prototype) => unknown;
  try {
    const mod = await import("../game/index");
    setupGameFn = mod.setupGame;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Smoke test failed — could not import game/index.ts: ${msg}`);
    process.exit(1);
  }

  if (typeof setupGameFn !== "function") {
    console.error("Smoke test failed — game/index.ts does not export setupGame()");
    process.exit(1);
  }

  const engine = new Engine(null, { headlessWidth: 800, headlessHeight: 600 });

  try {
    const result = setupGameFn(engine);
    const sceneName = typeof result === "string" ? result : (result as { startScene: string })?.startScene;
    if (!sceneName) {
      console.error("Smoke test failed — setupGame() did not return a scene name");
      process.exit(1);
    }
    await engine.start(sceneName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Smoke test failed during setup: ${msg}`);
    process.exit(1);
  }

  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) {
    try {
      engine.tick(dt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Smoke test failed at frame ${i}: ${msg}`);
      engine.stop();
      process.exit(1);
    }
  }

  engine.stop();
  console.log("Smoke test passed — 60 frames, no errors.");
}
