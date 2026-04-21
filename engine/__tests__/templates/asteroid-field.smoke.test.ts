/**
 * Smoke test for the `asteroid-field` template.
 *
 * Boots setupGame on a mock engine, loads the starting scene, transitions
 * to `play`, ticks ~60 frames, and asserts no errors, a non-empty world,
 * and that the player component exists. Note: the asteroid-field player
 * is identified by a `player` component (not a `player` tag), so
 * findByTag('player') is NOT asserted here — see the comment inline.
 */

import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/asteroid-field";
import { createTestEngine } from "./_engine";

describe("smoke: asteroid-field", () => {
  test("setupGame boots, ticks 60 frames, spawns player + asteroids, runs cleanup", async () => {
    const engine = createTestEngine();

    let setupThrew: unknown = null;
    let startScene: string | undefined;
    try {
      const result = setupGame(engine) as string | { startScene: string };
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

    // Load play — that's where player + asteroid spawner live.
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

    // Relaxed: asteroid-field's player uses a `player` component, not a
    // `player` tag — so findByTag('player') would return undefined.
    // Assert via component instead.
    const players = [...engine.world.with("player")];
    expect(players.length).toBe(1);

    // Asteroid spawner should have produced at least one asteroid in 1s.
    const asteroids = engine.findAllByTag("asteroid");
    expect(asteroids.length).toBeGreaterThan(0);

    // Trigger scene-cleanup path.
    await engine.loadScene("game-over");
    expect(tickErrors).toEqual([]);
  });
});
