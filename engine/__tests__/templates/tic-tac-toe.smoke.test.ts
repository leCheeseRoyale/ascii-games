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
import { GameRuntime } from "../../core/define-game";
import { mockTemplateEngine } from "./_engine";

describe("smoke: tic-tac-toe", () => {
  test("setupGame boots, registers a scene, ticks 60 frames, moves mutate state", async () => {
    const engine = mockTemplateEngine();
    // Mock engine doesn't expose `game`/`runGame` — shim them so setupGame
    // can register the declarative scene.
    let runtime: GameRuntime<any> | null = null;
    (engine as any).runGame = <T>(
      def: Parameters<GameRuntime<T>["dispatch"]> extends any ? any : never,
    ) => {
      const rt = new GameRuntime(def as any, engine as any);
      runtime = rt;
      (engine as any).game = rt;
      const scene = {
        name: def.startScene ?? "play",
        setup: () => rt.start(),
        update: (_e: unknown, dt: number) => rt.tick(dt),
        cleanup: () => engine.turns.stop(),
      };
      engine.registerScene(scene as any);
      return scene.name;
    };

    let setupThrew: unknown = null;
    let startScene: string | undefined;
    try {
      const result = setupGame(engine as unknown as Parameters<typeof setupGame>[0]);
      startScene = typeof result === "string" ? result : result.startScene;
    } catch (err) {
      setupThrew = err;
    }
    expect(setupThrew).toBeNull();
    expect(startScene).toBe("play");
    expect(runtime).not.toBeNull();

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
    const rt = runtime as unknown as GameRuntime<any>;
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
