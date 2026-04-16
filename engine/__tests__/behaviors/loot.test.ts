import { describe, expect, test } from "bun:test";
import { createSeededRandom, type LootTable, rollLoot } from "../../behaviors/loot";

// ── createSeededRandom ──────────────────────────────────────────

describe("createSeededRandom", () => {
  test("produces values in [0, 1)", () => {
    const rand = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("same seed produces identical sequences", () => {
    const a = createSeededRandom(12345);
    const b = createSeededRandom(12345);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  test("different seeds produce different sequences", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    let sameCount = 0;
    for (let i = 0; i < 20; i++) {
      if (a() === b()) sameCount++;
    }
    // Extremely unlikely for more than a handful to match.
    expect(sameCount).toBeLessThan(5);
  });

  test("seed 0 still produces a valid (non-crashing) sequence", () => {
    const rand = createSeededRandom(0);
    const v = rand();
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

// ── Single-entry drops ──────────────────────────────────────────

describe("rollLoot — single item drops", () => {
  test("drops exactly one item from a single-entry table", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold" }],
    };
    const drops = rollLoot(table, { seed: 1 });
    expect(drops.length).toBe(1);
    expect(drops[0].item).toBe("gold");
    expect(drops[0].count).toBe(1);
  });

  test("count range produces values within bounds", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold", count: [5, 10] }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const drops = rollLoot(table, { seed });
      expect(drops.length).toBe(1);
      expect(drops[0].count).toBeGreaterThanOrEqual(5);
      expect(drops[0].count).toBeLessThanOrEqual(10);
    }
  });

  test("count [N, N] always produces N", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold", count: [7, 7] }],
    };
    const drops = rollLoot(table, { seed: 42 });
    expect(drops[0].count).toBe(7);
  });

  test("empty table returns empty drops array", () => {
    const table: LootTable<string> = { entries: [] };
    const drops = rollLoot(table, { seed: 1 });
    expect(drops).toEqual([]);
  });

  test("rolls: 0 returns empty array", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold" }],
      rolls: 0,
    };
    const drops = rollLoot(table, { seed: 1 });
    expect(drops).toEqual([]);
  });
});

// ── Determinism ─────────────────────────────────────────────────

describe("rollLoot — determinism", () => {
  test("same seed produces same drops", () => {
    const table: LootTable<string> = {
      rolls: 5,
      entries: [
        { item: "gold", weight: 10, count: [1, 10] },
        { item: "potion", weight: 5, count: [1, 3] },
        { item: "gem", weight: 1 },
      ],
    };
    const a = rollLoot(table, { seed: 777 });
    const b = rollLoot(table, { seed: 777 });
    expect(a).toEqual(b);
  });

  test("different seeds produce different drops", () => {
    const table: LootTable<string> = {
      rolls: 5,
      entries: [
        { item: "gold", weight: 10, count: [1, 10] },
        { item: "potion", weight: 5, count: [1, 3] },
        { item: "gem", weight: 1, count: [1, 5] },
      ],
    };
    const a = JSON.stringify(rollLoot(table, { seed: 1 }));
    const b = JSON.stringify(rollLoot(table, { seed: 2 }));
    const c = JSON.stringify(rollLoot(table, { seed: 3 }));
    // At least one of these should differ (extremely likely all three do)
    expect(a === b && b === c).toBe(false);
  });

  test("no-seed runs still work (non-deterministic but valid)", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold", count: [1, 5] }],
    };
    const drops = rollLoot(table);
    expect(drops.length).toBe(1);
    expect(drops[0].count).toBeGreaterThanOrEqual(1);
    expect(drops[0].count).toBeLessThanOrEqual(5);
  });
});

// ── Weighted selection ──────────────────────────────────────────

describe("rollLoot — weighted selection", () => {
  test("higher weight items are picked more often", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [
        { item: "common", weight: 90 },
        { item: "rare", weight: 10 },
      ],
    };

    let commonCount = 0;
    let rareCount = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const drops = rollLoot(table, { seed });
      if (drops[0]?.item === "common") commonCount++;
      if (drops[0]?.item === "rare") rareCount++;
    }

    // With 90/10 split, common should be ~1800, rare ~200. Allow wide margin.
    expect(commonCount).toBeGreaterThan(rareCount);
    expect(commonCount).toBeGreaterThan(1500);
    expect(rareCount).toBeGreaterThan(50);
  });

  test("default weight is 1 (equal probability)", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ item: "a" }, { item: "b" }, { item: "c" }],
    };

    const counts = { a: 0, b: 0, c: 0 } as Record<string, number>;
    for (let seed = 1; seed <= 900; seed++) {
      const drops = rollLoot(table, { seed });
      const item = drops[0]?.item;
      if (item) counts[item]++;
    }
    // Each should be roughly 300 (~1/3). Allow plenty of slack.
    expect(counts.a).toBeGreaterThan(200);
    expect(counts.b).toBeGreaterThan(200);
    expect(counts.c).toBeGreaterThan(200);
  });

  test("multiple rolls produce multiple drops", () => {
    const table: LootTable<string> = {
      rolls: 5,
      entries: [{ item: "gold" }],
    };
    const drops = rollLoot(table, { seed: 1 });
    // Aggregated into one drop with count 5
    expect(drops.length).toBe(1);
    expect(drops[0].item).toBe("gold");
    expect(drops[0].count).toBe(5);
  });

  test("rolls as [min, max] varies count", () => {
    const table: LootTable<string> = {
      rolls: [2, 6],
      entries: [{ item: "gold" }],
    };
    const countsSeen = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const drops = rollLoot(table, { seed });
      if (drops[0]) {
        countsSeen.add(drops[0].count);
        expect(drops[0].count).toBeGreaterThanOrEqual(2);
        expect(drops[0].count).toBeLessThanOrEqual(6);
      }
    }
    // Should hit multiple different values across 50 seeds.
    expect(countsSeen.size).toBeGreaterThan(1);
  });

  test("zero or negative weights are excluded from the pool", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [
        { item: "excluded", weight: 0 },
        { item: "negative", weight: -5 },
        { item: "included", weight: 1 },
      ],
    };
    for (let seed = 1; seed <= 50; seed++) {
      const drops = rollLoot(table, { seed });
      expect(drops[0]?.item).toBe("included");
    }
  });
});

// ── Aggregation ─────────────────────────────────────────────────

describe("rollLoot — aggregation", () => {
  test("identical items aggregate into a single drop", () => {
    const table: LootTable<string> = {
      rolls: 10,
      entries: [{ item: "gold", count: [1, 3] }],
    };
    const drops = rollLoot(table, { seed: 42 });
    expect(drops.length).toBe(1);
    expect(drops[0].item).toBe("gold");
    // 10 rolls of 1-3 each → count between 10 and 30
    expect(drops[0].count).toBeGreaterThanOrEqual(10);
    expect(drops[0].count).toBeLessThanOrEqual(30);
  });

  test("different items produce distinct drops", () => {
    const table: LootTable<string> = {
      rolls: 10,
      entries: [
        { item: "gold", weight: 1 },
        { item: "silver", weight: 1 },
      ],
    };

    // Run until both items have appeared to confirm distinct drops.
    const drops = rollLoot(table, { seed: 7 });
    const ids = new Set(drops.map((d) => d.item));
    expect(ids.size).toBeGreaterThanOrEqual(1);
    expect(ids.size).toBeLessThanOrEqual(2);

    // With 10 rolls, high likelihood of getting both items across a range of seeds.
    let sawBoth = false;
    for (let seed = 1; seed <= 20 && !sawBoth; seed++) {
      const d = rollLoot(table, { seed });
      const s = new Set(d.map((x) => x.item));
      if (s.has("gold") && s.has("silver")) sawBoth = true;
    }
    expect(sawBoth).toBe(true);
  });

  test("object items are compared by reference identity", () => {
    const gold = { id: "gold", name: "Gold" };
    const silver = { id: "silver", name: "Silver" };
    const table: LootTable<typeof gold> = {
      rolls: 6,
      entries: [
        { item: gold, weight: 1 },
        { item: silver, weight: 1 },
      ],
    };

    for (let seed = 1; seed <= 10; seed++) {
      const drops = rollLoot(table, { seed });
      // Each distinct object is its own drop entry.
      expect(drops.length).toBeLessThanOrEqual(2);
      const total = drops.reduce((s, d) => s + d.count, 0);
      expect(total).toBe(6);
    }
  });
});

// ── Conditions ──────────────────────────────────────────────────

describe("rollLoot — condition callbacks", () => {
  test("entries whose condition returns false are ignored", () => {
    const table: LootTable<string> = {
      rolls: 20,
      entries: [
        { item: "basic" },
        { item: "legendary", condition: (ctx) => ctx.flags.level >= 10 },
      ],
    };

    // level 1 — legendary should never appear
    for (let seed = 1; seed <= 40; seed++) {
      const drops = rollLoot(table, { seed, flags: { level: 1 } });
      const ids = drops.map((d) => d.item);
      expect(ids).not.toContain("legendary");
    }
  });

  test("entries pass through when condition returns true", () => {
    const table: LootTable<string> = {
      rolls: 50,
      entries: [
        { item: "basic" },
        { item: "legendary", condition: (ctx) => ctx.flags.level >= 10 },
      ],
    };

    let sawLegendary = false;
    for (let seed = 1; seed <= 20 && !sawLegendary; seed++) {
      const drops = rollLoot(table, { seed, flags: { level: 15 } });
      if (drops.some((d) => d.item === "legendary")) sawLegendary = true;
    }
    expect(sawLegendary).toBe(true);
  });

  test("condition filtering doesn't inflate weight of other entries by absence", () => {
    // With legendary filtered out, the pool contains only "basic" → every roll is "basic"
    const table: LootTable<string> = {
      rolls: 5,
      entries: [
        { item: "basic", weight: 1 },
        { item: "legendary", weight: 100, condition: () => false },
      ],
    };
    const drops = rollLoot(table, { seed: 1 });
    expect(drops.length).toBe(1);
    expect(drops[0].item).toBe("basic");
    expect(drops[0].count).toBe(5);
  });

  test("ctx.flags is passed through correctly", () => {
    let receivedFlags: any = null;
    const table: LootTable<string> = {
      entries: [
        {
          item: "x",
          condition: (ctx) => {
            receivedFlags = ctx.flags;
            return true;
          },
        },
      ],
    };
    rollLoot(table, { seed: 1, flags: { luck: 42, difficulty: "hard" } });
    expect(receivedFlags).toEqual({ luck: 42, difficulty: "hard" });
  });

  test("ctx.flags defaults to empty object", () => {
    let receivedFlags: any = null;
    const table: LootTable<string> = {
      entries: [
        {
          item: "x",
          condition: (ctx) => {
            receivedFlags = ctx.flags;
            return true;
          },
        },
      ],
    };
    rollLoot(table, { seed: 1 });
    expect(receivedFlags).toEqual({});
  });
});

// ── Chance rolls ────────────────────────────────────────────────

describe("rollLoot — chance", () => {
  test("chance: 1 always drops", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ item: "gold", chance: 1 }],
    };
    for (let seed = 1; seed <= 50; seed++) {
      const drops = rollLoot(table, { seed });
      expect(drops.length).toBe(1);
      expect(drops[0].item).toBe("gold");
    }
  });

  test("chance: 0 never drops", () => {
    const table: LootTable<string> = {
      rolls: 10,
      entries: [
        { item: "gold", chance: 0 },
        { item: "silver", chance: 1, weight: 1 },
      ],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const drops = rollLoot(table, { seed });
      expect(drops.some((d) => d.item === "gold")).toBe(false);
    }
  });

  test("chance ~0.5 drops roughly half the time", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ item: "gold", chance: 0.5 }],
    };
    let dropped = 0;
    const iterations = 1000;
    for (let seed = 1; seed <= iterations; seed++) {
      const drops = rollLoot(table, { seed });
      if (drops.length > 0) dropped++;
    }
    // Expect somewhere between 35% and 65% (very loose to avoid flakiness).
    expect(dropped).toBeGreaterThan(iterations * 0.35);
    expect(dropped).toBeLessThan(iterations * 0.65);
  });
});

// ── Guaranteed drops ────────────────────────────────────────────

describe("rollLoot — guaranteed drops", () => {
  test("guaranteed entries always appear", () => {
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ item: "gold" }],
      guaranteed: [{ item: "xp", count: [5, 15] }],
    };
    for (let seed = 1; seed <= 30; seed++) {
      const drops = rollLoot(table, { seed });
      const xp = drops.find((d) => d.item === "xp");
      expect(xp).toBeDefined();
      expect(xp!.count).toBeGreaterThanOrEqual(5);
      expect(xp!.count).toBeLessThanOrEqual(15);
    }
  });

  test("guaranteed entries respect their condition", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold" }],
      guaranteed: [{ item: "xp" }, { item: "bonus", condition: (ctx) => ctx.flags.level >= 5 }],
    };

    const low = rollLoot(table, { seed: 1, flags: { level: 1 } });
    expect(low.some((d) => d.item === "xp")).toBe(true);
    expect(low.some((d) => d.item === "bonus")).toBe(false);

    const high = rollLoot(table, { seed: 1, flags: { level: 10 } });
    expect(high.some((d) => d.item === "xp")).toBe(true);
    expect(high.some((d) => d.item === "bonus")).toBe(true);
  });

  test("guaranteed entries respect their chance", () => {
    const table: LootTable<string> = {
      entries: [{ item: "gold" }],
      guaranteed: [{ item: "bonus", chance: 0 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const drops = rollLoot(table, { seed });
      expect(drops.some((d) => d.item === "bonus")).toBe(false);
    }
  });

  test("guaranteed still fires when entries list is empty", () => {
    const table: LootTable<string> = {
      entries: [],
      guaranteed: [{ item: "xp", count: [10, 10] }],
    };
    const drops = rollLoot(table, { seed: 1 });
    expect(drops).toEqual([{ item: "xp", count: 10 }]);
  });
});

// ── withReplacement ─────────────────────────────────────────────

describe("rollLoot — withReplacement: false", () => {
  test("without replacement, each entry is picked at most once", () => {
    const table: LootTable<string> = {
      rolls: 3,
      withReplacement: false,
      entries: [
        { item: "a", weight: 1 },
        { item: "b", weight: 1 },
        { item: "c", weight: 1 },
      ],
    };
    for (let seed = 1; seed <= 50; seed++) {
      const drops = rollLoot(table, { seed });
      // All 3 distinct items should be present.
      const ids = new Set(drops.map((d) => d.item));
      expect(ids.size).toBe(3);
      expect(ids.has("a")).toBe(true);
      expect(ids.has("b")).toBe(true);
      expect(ids.has("c")).toBe(true);
    }
  });

  test("without replacement, rolls > pool size stops at pool exhaustion", () => {
    const table: LootTable<string> = {
      rolls: 10,
      withReplacement: false,
      entries: [
        { item: "a", weight: 1 },
        { item: "b", weight: 1 },
      ],
    };
    const drops = rollLoot(table, { seed: 1 });
    // Only 2 distinct drops possible
    expect(drops.length).toBeLessThanOrEqual(2);
    const ids = new Set(drops.map((d) => d.item));
    expect(ids.size).toBeLessThanOrEqual(2);
  });

  test("with replacement (default), duplicates are possible", () => {
    const table: LootTable<string> = {
      rolls: 10,
      entries: [{ item: "a" }, { item: "b" }],
    };
    // Across many seeds, we expect to see aggregated counts > 1
    let sawDuplicate = false;
    for (let seed = 1; seed <= 20 && !sawDuplicate; seed++) {
      const drops = rollLoot(table, { seed });
      if (drops.some((d) => d.count > 1)) sawDuplicate = true;
    }
    expect(sawDuplicate).toBe(true);
  });
});

// ── Nested tables ───────────────────────────────────────────────

describe("rollLoot — nested tables", () => {
  test("nested tables recurse and drops are merged into output", () => {
    const rareTable: LootTable<string> = {
      entries: [{ item: "rare-sword" }, { item: "rare-gem" }],
    };
    const mainTable: LootTable<string> = {
      rolls: 1,
      entries: [{ table: rareTable }],
    };

    const drops = rollLoot(mainTable, { seed: 1 });
    expect(drops.length).toBe(1);
    expect(["rare-sword", "rare-gem"]).toContain(drops[0].item);
    expect(drops[0].count).toBe(1);
  });

  test("nested tables can themselves have guaranteed drops", () => {
    const nested: LootTable<string> = {
      entries: [{ item: "something" }],
      guaranteed: [{ item: "nested-xp", count: [3, 3] }],
    };
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ table: nested }],
    };

    const drops = rollLoot(table, { seed: 1 });
    const xp = drops.find((d) => d.item === "nested-xp");
    expect(xp).toBeDefined();
    expect(xp!.count).toBe(3);
  });

  test("nested tables can be multiplied by count range", () => {
    const nested: LootTable<string> = {
      entries: [{ item: "loot" }],
    };
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ table: nested, count: [3, 3] }],
    };
    const drops = rollLoot(table, { seed: 1 });
    // Nested rolled 3 times, all producing "loot" → aggregated count 3
    const loot = drops.find((d) => d.item === "loot");
    expect(loot).toBeDefined();
    expect(loot!.count).toBe(3);
  });

  test("nested drops aggregate with top-level drops of the same item", () => {
    const nested: LootTable<string> = {
      entries: [{ item: "gold", count: [5, 5] }],
    };
    const table: LootTable<string> = {
      rolls: 1,
      entries: [{ table: nested }],
      guaranteed: [{ item: "gold", count: [3, 3] }],
    };
    const drops = rollLoot(table, { seed: 1 });
    const gold = drops.find((d) => d.item === "gold");
    expect(gold).toBeDefined();
    expect(gold!.count).toBe(8); // 3 guaranteed + 5 nested
  });

  test("deeply nested tables work", () => {
    const level3: LootTable<string> = { entries: [{ item: "deep" }] };
    const level2: LootTable<string> = { entries: [{ table: level3 }] };
    const level1: LootTable<string> = { entries: [{ table: level2 }] };

    const drops = rollLoot(level1, { seed: 1 });
    expect(drops.length).toBe(1);
    expect(drops[0].item).toBe("deep");
  });
});

// ── Integration / realistic use case ────────────────────────────

describe("rollLoot — integration", () => {
  test("complex realistic loot table produces valid output", () => {
    interface Item {
      id: string;
      name: string;
    }

    const commonTable: LootTable<Item> = {
      rolls: [1, 2],
      entries: [
        { item: { id: "gold", name: "Gold" }, weight: 50, count: [1, 10] },
        { item: { id: "potion", name: "Potion" }, weight: 20, count: [1, 2] },
      ],
    };

    const rareTable: LootTable<Item> = {
      rolls: 1,
      entries: [
        { item: { id: "sword", name: "Sword" }, weight: 3 },
        { item: { id: "staff", name: "Staff" }, weight: 2 },
        { item: { id: "amulet", name: "Amulet" }, weight: 1 },
      ],
    };

    const mainTable: LootTable<Item> = {
      rolls: [2, 4],
      entries: [
        { table: commonTable, weight: 70 },
        {
          table: rareTable,
          weight: 30,
          chance: 0.5,
          condition: (ctx) => ctx.flags.level >= 3,
        },
      ],
      guaranteed: [{ item: { id: "xp", name: "XP" }, count: [10, 20] }],
    };

    const drops = rollLoot(mainTable, { seed: 99, flags: { level: 5 } });
    expect(drops.length).toBeGreaterThan(0);
    // xp always present
    expect(drops.some((d) => d.item.id === "xp")).toBe(true);
    // All counts positive
    for (const drop of drops) {
      expect(drop.count).toBeGreaterThan(0);
    }
  });
});
