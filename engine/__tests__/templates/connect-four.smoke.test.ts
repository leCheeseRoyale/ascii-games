/**
 * Smoke test for the `connect-four` template.
 *
 * Exercises the full `defineGame` wrapper path: setupGame registers the
 * auto-generated scene via `engine.runGame`, loadScene triggers setup (which
 * runs the game's own `setup`), 60 frames tick without error, and moves
 * can be dispatched via the runtime to drive state mutations + auto
 * turn-rotation across a 7x6 grid with gravity + 4-in-a-row detection.
 */

import { describe, expect, test } from "bun:test";
import { connectFour, setupGame } from "../../../games/connect-four";
import { createTestEngine } from "./_engine";

describe("smoke: connect-four", () => {
  test("setupGame boots, registers a scene, ticks 60 frames, moves mutate state", async () => {
    const engine = createTestEngine();

    let setupThrew: unknown = null;
    let startScene: string | undefined;
    try {
      const result = setupGame(engine);
      startScene = typeof result === "string" ? result : result.startScene;
    } catch (err) {
      setupThrew = err;
    }
    expect(setupThrew).toBeNull();
    expect(startScene).toBe("play");
    expect(engine.game).not.toBeNull();

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

    // Drive a full game: R plays column 0 four times while Y plays column 1
    // three times. R wins the vertical at column 0.
    const rt = engine.game!;
    expect(rt.currentPlayer).toBe("R");
    rt.dispatch("drop", [0]); // R → (5, 0)
    rt.dispatch("drop", [1]); // Y → (5, 1)
    rt.dispatch("drop", [0]); // R → (4, 0)
    rt.dispatch("drop", [1]); // Y → (4, 1)
    rt.dispatch("drop", [0]); // R → (3, 0)
    rt.dispatch("drop", [1]); // Y → (3, 1)
    rt.dispatch("drop", [0]); // R → (2, 0) — vertical 4-in-a-row
    expect(rt.result).toEqual({ winner: "R" });

    // Verify the def is structurally what we expect.
    expect(connectFour.name).toBe("connect-four");
    expect(Object.keys(connectFour.moves)).toEqual(["drop", "reset"]);
  });
});
