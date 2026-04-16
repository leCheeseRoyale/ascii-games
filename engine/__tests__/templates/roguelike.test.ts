import { describe, expect, test } from "bun:test";
import { setupGame } from "../../../games/roguelike";
import { mockTemplateEngine } from "./_engine";

describe("template: roguelike", () => {
  test("boots, loads play scene, and produces expected entity tags", async () => {
    const engine = mockTemplateEngine();
    const errors: unknown[] = [];

    const result = setupGame(engine as unknown as Parameters<typeof setupGame>[0]);
    expect(result.startScene).toBe("title");

    await engine.loadScene("play", { data: { floor: 1 } });

    for (let i = 0; i < 60; i++) {
      try {
        engine.tick(1 / 60);
      } catch (err) {
        errors.push(err);
      }
    }

    expect(errors).toEqual([]);

    expect(engine.findByTag("player")).toBeDefined();
    expect(engine.findAllByTag("enemy").length).toBeGreaterThan(0);
  });
});
