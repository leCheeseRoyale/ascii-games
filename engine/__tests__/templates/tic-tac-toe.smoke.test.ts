/**
 * Smoke test for the `tic-tac-toe` template.
 *
 * Exercises the full `defineGame` wrapper path: setupGame registers the
 * auto-generated scene via `engine.runGame`, loadScene triggers setup (which
 * runs the game's own `setup`), 60 frames tick without error, and moves
 * can be dispatched via the runtime to drive state mutations + auto
 * turn-rotation.
 */

import { describe, expect, test } from "bun:test";
import { setupGame, ticTacToe } from "../../../games/tic-tac-toe";
import { createTestEngine } from "./_engine";

describe("smoke: tic-tac-toe", () => {
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

    // Drive a full game through the runtime. Column of 3 for X down the
    // left side wins: indices 0, 3, 6.
    const rt = engine.game!;
    expect(rt.currentPlayer).toBe("X");
    rt.dispatch("place", [0]); // X
    rt.dispatch("place", [1]); // O
    rt.dispatch("place", [3]); // X
    rt.dispatch("place", [4]); // O
    rt.dispatch("place", [6]); // X — wins column 0
    expect(rt.result).toEqual({ winner: "X" });

    // Verify the def is structurally what we expect.
    expect(ticTacToe.name).toBe("tic-tac-toe");
    expect(Object.keys(ticTacToe.moves)).toEqual(["place", "reset"]);
  });
});
