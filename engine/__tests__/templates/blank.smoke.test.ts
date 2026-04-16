/**
 * Smoke test for the `blank` template.
 *
 * Boots setupGame on a mock engine, loads the starting scene, ticks ~60
 * frames at dt=1/60 (≈1s sim time), and asserts no uncaught errors, a
 * non-empty world, and a tagged player entity. Triggers the scene-cleanup
 * path by loading another registered scene at the end.
 */

import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/blank";
import { mockTemplateEngine } from "./_engine";

describe("smoke: blank", () => {
  test("setupGame boots, ticks 60 frames, spawns player, runs cleanup", async () => {
    const engine = mockTemplateEngine();

    let setupThrew: unknown = null;
    let startScene: string | undefined;
    try {
      const result = setupGame(engine as unknown as Parameters<typeof setupGame>[0]) as
        | string
        | { startScene: string };
      startScene = typeof result === "string" ? result : result.startScene;
    } catch (err) {
      setupThrew = err;
    }
    expect(setupThrew).toBeNull();
    expect(startScene).toBe("title");

    await engine.loadScene(startScene as string);

    const tickErrors: unknown[] = [];
    for (let i = 0; i < 60; i++) {
      try {
        engine.tick(1 / 60);
      } catch (err) {
        tickErrors.push(err);
      }
    }
    expect(tickErrors).toEqual([]);

    // Title scene only renders ASCII banners — player spawns on `play`.
    // Load `play` and tick again to verify the game-loop path.
    await engine.loadScene("play");
    for (let i = 0; i < 60; i++) {
      try {
        engine.tick(1 / 60);
      } catch (err) {
        tickErrors.push(err);
      }
    }
    expect(tickErrors).toEqual([]);

    const entityCount = [...engine.world.with("position")].length;
    expect(entityCount).toBeGreaterThan(0);

    expect(engine.findByTag("player")).toBeDefined();

    // Exercise the scene.cleanup path by transitioning back. No template
    // currently defines cleanup, but loadScene auto-invokes it when present
    // and clears world+systems — verifying that path runs without error.
    await engine.loadScene("title");
    expect(tickErrors).toEqual([]);
  });
});
