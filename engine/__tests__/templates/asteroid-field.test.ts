import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/asteroid-field";
import { createTestEngine } from "./_engine";

describe("template: asteroid-field", () => {
  test("boots, loads play scene, and produces expected entity tags", async () => {
    const engine = createTestEngine();
    const errors: unknown[] = [];

    const start = setupGame(engine);
    expect(start).toBe("title");

    await engine.loadScene("play");

    for (let i = 0; i < 60; i++) {
      try {
        engine.tick(1 / 60);
      } catch (err) {
        errors.push(err);
      }
    }

    expect(errors).toEqual([]);

    // Player has no 'player' tag (uses `player` component instead),
    // so smoke-test on the component + at least one asteroid spawning.
    const players = [...engine.world.with("player")];
    expect(players.length).toBe(1);

    const asteroids = engine.findAllByTag("asteroid");
    expect(asteroids.length).toBeGreaterThan(0);
  });
});
