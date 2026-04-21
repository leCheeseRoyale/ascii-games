/**
 * Smoke test for the `roguelike` template.
 *
 * The roguelike returns the richer `{ startScene, screens, hud }` object
 * shape from setupGame. This test verifies both the object-return path
 * and the full play loop: dungeon generation, player spawn, enemy spawn,
 * 60 frames of tick, scene cleanup.
 */

import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/roguelike";
import { createTestEngine } from "./_engine";

describe("smoke: roguelike", () => {
  test("setupGame boots, ticks 60 frames, spawns player + enemies, runs cleanup", async () => {
    const engine = createTestEngine();

    let setupThrew: unknown = null;
    let startScene: string | undefined;
    try {
      const result = setupGame(engine);
      // Roguelike returns the object shape.
      expect(typeof result).toBe("object");
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

    // Play scene needs a floor number in sceneData.
    await engine.loadScene("play", { data: { floor: 1 } });
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
    expect(engine.findAllByTag("enemy").length).toBeGreaterThan(0);

    // Trigger scene-cleanup path.
    await engine.loadScene("game-over");
    expect(tickErrors).toEqual([]);
  });
});
