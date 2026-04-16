import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/platformer";
import { mockTemplateEngine } from "./_engine";

describe("template: platformer", () => {
  test("boots, loads play scene, and produces expected entity tags", async () => {
    const engine = mockTemplateEngine();
    const errors: unknown[] = [];

    const start = setupGame(engine as unknown as Parameters<typeof setupGame>[0]);
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

    expect(engine.findByTag("player")).toBeDefined();
    expect(engine.findAllByTag("platform").length).toBeGreaterThan(0);
  });
});
