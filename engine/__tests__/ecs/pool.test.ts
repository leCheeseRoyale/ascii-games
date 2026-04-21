import { beforeEach, describe, expect, test } from "bun:test";
import { createEntityPool } from "../../ecs/pool";
import { mockEngine } from "../helpers";

type Bullet = {
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  ascii: { char: string; font: string; color: string; opacity?: number };
  lifetime?: { remaining: number };
};

function bulletFactory(): Bullet {
  return {
    position: { x: 0, y: 0 },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: "|", font: "16px monospace", color: "#ff0", opacity: 1 },
    lifetime: { remaining: 2 },
  };
}

describe("createEntityPool", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine();
  });

  test("acquire creates an entity and adds it to the world", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire();

    expect(bullet).toBeDefined();
    expect(pool.active).toBe(1);
    expect(pool.available).toBe(0);
    expect(pool.total).toBe(1);
    // Entity is in the miniplex world
    expect(engine.world.entities).toContain(bullet as any);
  });

  test("release returns an entity to available and removes from world", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire();

    pool.release(bullet);

    expect(pool.active).toBe(0);
    expect(pool.available).toBe(1);
    expect(pool.total).toBe(1);
    expect(engine.world.entities).not.toContain(bullet as any);
  });

  test("second acquire reuses the released entity (no new allocation)", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const first = pool.acquire();
    pool.release(first);

    const second = pool.acquire();

    // Same object reference — it was pulled from available
    expect(second).toBe(first);
    expect(pool.active).toBe(1);
    expect(pool.available).toBe(0);
    // And it's back in the world
    expect(engine.world.entities).toContain(second as any);
  });

  test("pool respects max — at max capacity, reuses the oldest active entity", () => {
    const pool = createEntityPool(engine, bulletFactory, { max: 2 });

    const a = pool.acquire({ position: { x: 1, y: 0 } });
    const b = pool.acquire({ position: { x: 2, y: 0 } });

    expect(pool.total).toBe(2);
    expect(pool.active).toBe(2);

    // Pool is full — next acquire recycles `a` (oldest)
    const c = pool.acquire({ position: { x: 3, y: 0 } });
    expect(c).toBe(a);
    expect(pool.total).toBe(2);
    expect(pool.active).toBe(2);
    // a (reused) should still be in world and at the new position
    expect(c.position.x).toBe(3);
    // b is untouched
    expect(b.position.x).toBe(2);
  });

  test("warmup() pre-allocates entities into available", () => {
    const pool = createEntityPool(engine, bulletFactory, { size: 5 });

    expect(pool.active).toBe(0);
    expect(pool.available).toBe(5);
    expect(pool.total).toBe(5);
    // Warmed-up entities are not in the world
    expect(engine.world.entities.length).toBe(0);
  });

  test("warmup(count) can be called manually with explicit count", () => {
    const pool = createEntityPool(engine, bulletFactory);
    expect(pool.available).toBe(0);

    pool.warmup(3);
    expect(pool.available).toBe(3);
  });

  test("warmup respects max cap", () => {
    const pool = createEntityPool(engine, bulletFactory, { max: 2, size: 10 });
    expect(pool.total).toBe(2);
  });

  test("releaseAll() moves all active entities to available", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();

    expect(pool.active).toBe(3);

    pool.releaseAll();

    expect(pool.active).toBe(0);
    expect(pool.available).toBe(3);
    expect(engine.world.entities).not.toContain(a as any);
    expect(engine.world.entities).not.toContain(b as any);
    expect(engine.world.entities).not.toContain(c as any);
  });

  test("total always equals active + available", () => {
    const pool = createEntityPool(engine, bulletFactory, { size: 3 });

    expect(pool.total).toBe(pool.active + pool.available);

    pool.acquire();
    expect(pool.total).toBe(pool.active + pool.available);

    pool.acquire();
    expect(pool.total).toBe(pool.active + pool.available);

    const remaining = pool.acquire();
    expect(pool.total).toBe(pool.active + pool.available);

    pool.release(remaining);
    expect(pool.total).toBe(pool.active + pool.available);
  });

  test("overrides shallow-merge into nested component objects", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire({
      position: { x: 100, y: 200 },
      velocity: { vx: 50, vy: -100 },
    });

    expect(bullet.position.x).toBe(100);
    expect(bullet.position.y).toBe(200);
    expect(bullet.velocity.vx).toBe(50);
    expect(bullet.velocity.vy).toBe(-100);
    // Other components are untouched
    expect(bullet.ascii.char).toBe("|");
  });

  test("overrides preserve existing component object references (shallow merge)", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire();
    const positionRef = bullet.position;

    pool.release(bullet);
    const reused = pool.acquire({ position: { x: 42, y: 99 } });

    // Same outer entity
    expect(reused).toBe(bullet);
    // Same nested object — mutated in place, not replaced
    expect(reused.position).toBe(positionRef);
    expect(reused.position.x).toBe(42);
    expect(reused.position.y).toBe(99);
  });

  test("overrides with non-object values assign directly", () => {
    interface ScalarEntity {
      position: { x: number; y: number };
      level?: number;
    }
    const pool = createEntityPool<ScalarEntity>(engine, () => ({
      position: { x: 0, y: 0 },
    }));
    const entity = pool.acquire({ level: 7 } as any);
    expect((entity as any).level).toBe(7);
  });

  test("default reset clears velocity, lifetime, and ascii opacity", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire({
      velocity: { vx: 100, vy: -50 },
    });
    bullet.lifetime = { remaining: 1.5 };
    bullet.ascii.opacity = 0.7;

    pool.release(bullet);

    expect(bullet.velocity.vx).toBe(0);
    expect(bullet.velocity.vy).toBe(0);
    expect(bullet.lifetime).toBeUndefined();
    expect(bullet.ascii.opacity).toBe(0);
  });

  test("custom reset callback runs on release instead of default", () => {
    let resetCalls = 0;
    const customReset = (entity: any) => {
      resetCalls++;
      entity.ascii.char = "_reset_";
    };

    const pool = createEntityPool(engine, bulletFactory, { reset: customReset });
    const bullet = pool.acquire();
    bullet.velocity.vx = 200; // default reset would clear this

    pool.release(bullet);

    expect(resetCalls).toBe(1);
    expect(bullet.ascii.char).toBe("_reset_");
    // Default reset did NOT run, so velocity is preserved
    expect(bullet.velocity.vx).toBe(200);
  });

  test("destroy() removes all entities from world and clears both arrays", () => {
    const pool = createEntityPool(engine, bulletFactory, { size: 3 });
    const a = pool.acquire();
    const b = pool.acquire();

    expect(pool.total).toBe(3); // 1 still available + 2 active

    pool.destroy();

    expect(pool.active).toBe(0);
    expect(pool.available).toBe(0);
    expect(pool.total).toBe(0);
    expect(engine.world.entities).not.toContain(a as any);
    expect(engine.world.entities).not.toContain(b as any);
  });

  test("max is exposed as a readonly property", () => {
    const pool = createEntityPool(engine, bulletFactory, { max: 50 });
    expect(pool.max).toBe(50);
  });

  test("default max is Infinity (no practical cap)", () => {
    const pool = createEntityPool(engine, bulletFactory);
    expect(pool.max).toBe(Number.POSITIVE_INFINITY);
  });

  test("acquire without overrides works on a fresh entity", () => {
    const pool = createEntityPool(engine, bulletFactory);
    const bullet = pool.acquire();

    expect(bullet.position.x).toBe(0);
    expect(bullet.position.y).toBe(0);
    expect(bullet.ascii.char).toBe("|");
  });

  test("reusing oldest active on saturation keeps pool size stable", () => {
    const pool = createEntityPool(engine, bulletFactory, { max: 3 });
    const entities: Bullet[] = [];
    for (let i = 0; i < 10; i++) {
      entities.push(pool.acquire({ position: { x: i, y: 0 } }));
    }

    // Still exactly 3 total, all active
    expect(pool.total).toBe(3);
    expect(pool.active).toBe(3);
    expect(pool.available).toBe(0);

    // The last 3 x-values (7, 8, 9) should be represented in the pool
    // (entities cycle, but all 3 active entries are there)
    // Verify via engine world count too
    expect(engine.world.entities.length).toBe(3);
  });

  test("warmup pre-allocated entities are reused on first acquire", () => {
    const pool = createEntityPool(engine, bulletFactory, { size: 2 });
    expect(pool.available).toBe(2);

    const a = pool.acquire();
    // Pulling from available doesn't call factory — same ref later
    expect(pool.available).toBe(1);
    expect(pool.active).toBe(1);

    pool.release(a);
    const reused = pool.acquire();
    expect(reused).toBe(a);
  });

  test("multiple acquire/release cycles don't leak entities", () => {
    const pool = createEntityPool(engine, bulletFactory);
    for (let i = 0; i < 50; i++) {
      const e = pool.acquire();
      pool.release(e);
    }
    // Only ever created 1 entity
    expect(pool.total).toBe(1);
    expect(pool.active).toBe(0);
    expect(pool.available).toBe(1);
  });

  test("releaseAll on empty pool is a no-op", () => {
    const pool = createEntityPool(engine, bulletFactory);
    expect(() => pool.releaseAll()).not.toThrow();
    expect(pool.total).toBe(0);
  });
});
