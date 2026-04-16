/**
 * Smoke test for the `platformer` template.
 *
 * This template shipped broken once (docs/TODO.md item #2) — this test
 * guards against that. Boots setupGame, loads `title` then `play`, ticks
 * ~60 frames, and asserts a tagged player, at least one platform, and
 * no uncaught errors throughout.
 */

import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/platformer";
import { mockTemplateEngine } from "./_engine";

describe("smoke: platformer", () => {
  test("setupGame boots, ticks 60 frames, spawns player + platforms, runs cleanup", async () => {
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

    // Player + platforms live on the `play` scene.
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
    expect(engine.findAllByTag("platform").length).toBeGreaterThan(0);

    // Trigger scene-cleanup path.
    await engine.loadScene("title");
    expect(tickErrors).toEqual([]);
  });
});
