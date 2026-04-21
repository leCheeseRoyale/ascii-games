import { describe, expect, test } from "bun:test";
import { createWaveSpawner } from "../../behaviors/wave-spawner";
import { mockEngine } from "../helpers";

describe("createWaveSpawner", () => {
  test("returns a System", () => {
    const sys = createWaveSpawner({ waves: [] });
    expect(sys.name).toBeDefined();
    expect(typeof sys.update).toBe("function");
  });

  test("fires onWaveStart callback when wave begins", () => {
    const engine = mockEngine();
    let waveStarted = -1;
    const sys = createWaveSpawner({
      waves: [
        {
          enemies: [{ create: () => ({ position: { x: 0, y: 0 } }), count: 1, spawnDelay: 0 }],
          delay: 0,
        },
      ],
      onWaveStart: (i) => {
        waveStarted = i;
      },
    });

    sys.init?.(engine);
    sys.update(engine, 0.016);
    // May need another tick for wave to actually start
    sys.update(engine, 0.016);
    expect(waveStarted).toBe(0);
  });

  test("spawns enemies with the configured tag", () => {
    const engine = mockEngine();
    const sys = createWaveSpawner({
      waves: [
        {
          enemies: [
            {
              create: () => ({ position: { x: 0, y: 0 } }),
              count: 3,
              spawnDelay: 0,
            },
          ],
          delay: 0,
        },
      ],
      enemyTag: "wave-test",
    });

    sys.init?.(engine);
    // Advance enough ticks to spawn all enemies
    for (let i = 0; i < 20; i++) {
      sys.update(engine, 0.1);
    }

    const spawned = [...engine.world.with("tags")].filter((e: any) =>
      e.tags?.values?.has("wave-test"),
    );
    expect(spawned.length).toBe(3);
  });

  test("fires onAllWavesComplete when final wave clears", () => {
    const engine = mockEngine();
    let allDone = false;
    const sys = createWaveSpawner({
      waves: [
        {
          enemies: [{ create: () => ({ position: { x: 0, y: 0 } }), count: 1, spawnDelay: 0 }],
          delay: 0,
        },
      ],
      enemyTag: "wave-test",
      onAllWavesComplete: () => {
        allDone = true;
      },
    });

    sys.init?.(engine);

    // Spawn the enemy
    for (let i = 0; i < 10; i++) {
      sys.update(engine, 0.1);
    }

    // Remove all enemies to trigger completion
    for (const e of [...engine.world.with("tags")]) {
      engine.world.remove(e as any);
    }

    // Advance to detect empty
    for (let i = 0; i < 5; i++) {
      sys.update(engine, 0.1);
    }

    expect(allDone).toBe(true);
  });

  test("init resets wave state (safe to re-add)", () => {
    const engine = mockEngine();
    const sys = createWaveSpawner({ waves: [] });

    expect(() => {
      sys.init?.(engine);
      sys.init?.(engine);
    }).not.toThrow();
  });
});
