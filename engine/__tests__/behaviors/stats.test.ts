import { describe, expect, test } from "bun:test";
import {
  addModifier,
  clearModifiers,
  createStats,
  deserializeStats,
  getModifiersFor,
  getStat,
  hasModifier,
  removeModifier,
  removeModifiersBySource,
  type StatModifier,
  serializeStats,
  setBaseStat,
  tickModifiers,
} from "../../behaviors/stats";

// ── createStats ─────────────────────────────────────────────────

describe("createStats", () => {
  test("creates a stats object from base values", () => {
    const stats = createStats({ strength: 10, maxHp: 100 });
    expect(stats.base.strength).toBe(10);
    expect(stats.base.maxHp).toBe(100);
    expect(stats.modifiers).toEqual([]);
  });

  test("does not alias the provided base object", () => {
    const base = { strength: 10 };
    const stats = createStats(base);
    base.strength = 999;
    expect(stats.base.strength).toBe(10);
  });

  test("getStat returns 0 for an unknown stat with no mods", () => {
    const stats = createStats({ strength: 10 });
    expect(getStat(stats, "agility")).toBe(0);
  });
});

// ── getStat (no modifiers) ──────────────────────────────────────

describe("getStat without modifiers", () => {
  test("returns the base value when no modifiers are active", () => {
    const stats = createStats({ strength: 10, maxHp: 100 });
    expect(getStat(stats, "strength")).toBe(10);
    expect(getStat(stats, "maxHp")).toBe(100);
  });

  test("returns base when modifiers target different stats", () => {
    const stats = createStats({ strength: 10, agility: 8 });
    addModifier(stats, { id: "m1", stat: "agility", type: "flat", value: 5 });
    expect(getStat(stats, "strength")).toBe(10);
  });
});

// ── setBaseStat ────────────────────────────────────────────────

describe("setBaseStat", () => {
  test("updates the base value", () => {
    const stats = createStats({ strength: 10 });
    setBaseStat(stats, "strength", 20);
    expect(getStat(stats, "strength")).toBe(20);
  });

  test("can introduce new stats", () => {
    const stats = createStats({ strength: 10 });
    setBaseStat(stats, "luck", 7);
    expect(getStat(stats, "luck")).toBe(7);
  });

  test("does not affect modifiers", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    setBaseStat(stats, "strength", 20);
    expect(getStat(stats, "strength")).toBe(25);
  });
});

// ── addModifier: individual types ───────────────────────────────

describe("addModifier — individual types", () => {
  test("flat modifier adds to base", () => {
    const stats = createStats({ strength: 10 });
    expect(addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 })).toBe(true);
    expect(getStat(stats, "strength")).toBe(15);
  });

  test("negative flat modifier subtracts from base", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: -3 });
    expect(getStat(stats, "strength")).toBe(7);
  });

  test("percent modifier scales the base", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "percent", value: 0.2 });
    expect(getStat(stats, "strength")).toBeCloseTo(12, 5); // 10 * 1.2
  });

  test("multiplier modifier multiplies the base", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "multiplier", value: 2 });
    expect(getStat(stats, "strength")).toBe(20);
  });

  test("multiplier of 0.5 halves the base", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "multiplier", value: 0.5 });
    expect(getStat(stats, "strength")).toBe(5);
  });
});

// ── addModifier: combined order of operations ──────────────────

describe("addModifier — combined modifiers", () => {
  test("flat + percent: (base + flat) * (1 + percent)", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "flat1", stat: "strength", type: "flat", value: 5 });
    addModifier(stats, { id: "pct1", stat: "strength", type: "percent", value: 0.2 });
    // (10 + 5) * (1 + 0.2) = 18
    expect(getStat(stats, "strength")).toBeCloseTo(18, 5);
  });

  test("multiple percents sum before multiplying", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "p1", stat: "strength", type: "percent", value: 0.2 });
    addModifier(stats, { id: "p2", stat: "strength", type: "percent", value: 0.3 });
    // 10 * (1 + 0.5) = 15
    expect(getStat(stats, "strength")).toBeCloseTo(15, 5);
  });

  test("multiple multipliers compound via product", () => {
    const stats = createStats({ damage: 10 });
    addModifier(stats, { id: "m1", stat: "damage", type: "multiplier", value: 2 });
    addModifier(stats, { id: "m2", stat: "damage", type: "multiplier", value: 1.5 });
    // 10 * 2 * 1.5 = 30
    expect(getStat(stats, "damage")).toBeCloseTo(30, 5);
  });

  test("flat + percent + multiplier combine correctly", () => {
    const stats = createStats({ damage: 10 });
    addModifier(stats, { id: "f", stat: "damage", type: "flat", value: 5 });
    addModifier(stats, { id: "p", stat: "damage", type: "percent", value: 0.2 });
    addModifier(stats, { id: "m", stat: "damage", type: "multiplier", value: 2 });
    // (10 + 5) * (1 + 0.2) * 2 = 36
    expect(getStat(stats, "damage")).toBeCloseTo(36, 5);
  });

  test("multiple flats sum", () => {
    const stats = createStats({ armor: 10 });
    addModifier(stats, { id: "f1", stat: "armor", type: "flat", value: 3 });
    addModifier(stats, { id: "f2", stat: "armor", type: "flat", value: 7 });
    expect(getStat(stats, "armor")).toBe(20);
  });

  test("negative percent reduces the stat", () => {
    const stats = createStats({ speed: 100 });
    addModifier(stats, { id: "slow", stat: "speed", type: "percent", value: -0.3 });
    expect(getStat(stats, "speed")).toBeCloseTo(70, 5);
  });
});

// ── removeModifier ──────────────────────────────────────────────

describe("removeModifier", () => {
  test("removes a modifier by id", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    expect(getStat(stats, "strength")).toBe(15);
    expect(removeModifier(stats, "m1")).toBe(true);
    expect(getStat(stats, "strength")).toBe(10);
  });

  test("returns false when id not found", () => {
    const stats = createStats({ strength: 10 });
    expect(removeModifier(stats, "missing")).toBe(false);
  });

  test("only removes the matching modifier", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    addModifier(stats, { id: "m2", stat: "strength", type: "flat", value: 3 });
    removeModifier(stats, "m1");
    expect(getStat(stats, "strength")).toBe(13);
    expect(hasModifier(stats, "m2")).toBe(true);
  });
});

// ── removeModifiersBySource ────────────────────────────────────

describe("removeModifiersBySource", () => {
  test("removes all modifiers with matching source", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "ring",
    });
    addModifier(stats, {
      id: "m2",
      stat: "strength",
      type: "percent",
      value: 0.1,
      source: "ring",
    });
    addModifier(stats, {
      id: "m3",
      stat: "strength",
      type: "flat",
      value: 2,
      source: "belt",
    });
    const removed = removeModifiersBySource(stats, "ring");
    expect(removed).toBe(2);
    expect(stats.modifiers.length).toBe(1);
    expect(stats.modifiers[0].source).toBe("belt");
  });

  test("returns 0 when no modifiers match", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    expect(removeModifiersBySource(stats, "ghost")).toBe(0);
  });
});

// ── clearModifiers / hasModifier / getModifiersFor ────────────

describe("clearModifiers / hasModifier / getModifiersFor", () => {
  test("clearModifiers drops every active modifier", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    addModifier(stats, { id: "m2", stat: "strength", type: "percent", value: 0.2 });
    clearModifiers(stats);
    expect(stats.modifiers.length).toBe(0);
    expect(getStat(stats, "strength")).toBe(10);
  });

  test("clearModifiers keeps base values intact", () => {
    const stats = createStats({ strength: 10, maxHp: 100 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    clearModifiers(stats);
    expect(stats.base.strength).toBe(10);
    expect(stats.base.maxHp).toBe(100);
  });

  test("hasModifier checks by id", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    expect(hasModifier(stats, "m1")).toBe(true);
    expect(hasModifier(stats, "m2")).toBe(false);
  });

  test("getModifiersFor returns all mods targeting a given stat", () => {
    const stats = createStats({ strength: 10, agility: 8 });
    addModifier(stats, { id: "s1", stat: "strength", type: "flat", value: 5 });
    addModifier(stats, { id: "s2", stat: "strength", type: "percent", value: 0.1 });
    addModifier(stats, { id: "a1", stat: "agility", type: "flat", value: 3 });
    const strMods = getModifiersFor(stats, "strength");
    expect(strMods.length).toBe(2);
    expect(strMods.map((m) => m.id).sort()).toEqual(["s1", "s2"]);
  });
});

// ── Stacking rules ──────────────────────────────────────────────

describe("stacking rules", () => {
  test("stack (default) — multiple mods with same source all apply", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "poison",
      stacking: "stack",
    });
    addModifier(stats, {
      id: "m2",
      stat: "strength",
      type: "flat",
      value: 3,
      source: "poison",
      stacking: "stack",
    });
    expect(stats.modifiers.length).toBe(2);
    expect(getStat(stats, "strength")).toBe(18);
  });

  test("stack is the default when stacking is omitted", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "poison",
    });
    addModifier(stats, {
      id: "m2",
      stat: "strength",
      type: "flat",
      value: 3,
      source: "poison",
    });
    expect(stats.modifiers.length).toBe(2);
  });

  test("refresh — reapplying the same source resets duration and replaces value", () => {
    const stats = createStats({ strength: 10 });
    const first: StatModifier = {
      id: "buff-1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "buff",
      duration: 5,
      stacking: "refresh",
    };
    expect(addModifier(stats, first)).toBe(true);
    expect(stats.modifiers.length).toBe(1);

    // Partially tick the timer down.
    tickModifiers(stats, 3);
    expect(stats.modifiers[0]._remaining).toBeCloseTo(2, 5);

    // Reapply — same source, refresh should overwrite (not append) and reset.
    const refreshed: StatModifier = {
      id: "buff-2",
      stat: "strength",
      type: "flat",
      value: 7,
      source: "buff",
      duration: 10,
      stacking: "refresh",
    };
    expect(addModifier(stats, refreshed)).toBe(false);
    expect(stats.modifiers.length).toBe(1);
    expect(stats.modifiers[0].value).toBe(7);
    expect(stats.modifiers[0]._remaining).toBeCloseTo(10, 5);
    expect(getStat(stats, "strength")).toBe(17);
  });

  test("replace — reapplying same source overwrites the existing mod", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "orig",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "aura",
      stacking: "replace",
    });
    expect(stats.modifiers.length).toBe(1);
    expect(
      addModifier(stats, {
        id: "next",
        stat: "strength",
        type: "flat",
        value: 10,
        source: "aura",
        stacking: "replace",
      }),
    ).toBe(false);
    expect(stats.modifiers.length).toBe(1);
    expect(stats.modifiers[0].value).toBe(10);
    expect(stats.modifiers[0].id).toBe("next");
  });

  test("refresh/replace only match on same stat AND source", () => {
    const stats = createStats({ strength: 10, agility: 8 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "ring",
      stacking: "refresh",
    });
    // Same source, different stat — should not refresh, should add new.
    addModifier(stats, {
      id: "m2",
      stat: "agility",
      type: "flat",
      value: 3,
      source: "ring",
      stacking: "refresh",
    });
    expect(stats.modifiers.length).toBe(2);
  });

  test("refresh/replace without a source still adds as new", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      stacking: "refresh",
    });
    addModifier(stats, {
      id: "m2",
      stat: "strength",
      type: "flat",
      value: 3,
      stacking: "refresh",
    });
    expect(stats.modifiers.length).toBe(2);
  });
});

// ── tickModifiers ───────────────────────────────────────────────

describe("tickModifiers", () => {
  test("decrements _remaining on timed modifiers", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 10,
    });
    tickModifiers(stats, 3);
    expect(stats.modifiers[0]._remaining).toBeCloseTo(7, 5);
  });

  test("removes modifiers whose timer hits zero", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 2,
    });
    const expired = tickModifiers(stats, 2);
    expect(expired.length).toBe(1);
    expect(expired[0].id).toBe("m1");
    expect(stats.modifiers.length).toBe(0);
    expect(getStat(stats, "strength")).toBe(10);
  });

  test("removes mods that go past zero", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 1,
    });
    const expired = tickModifiers(stats, 10);
    expect(expired.length).toBe(1);
    expect(stats.modifiers.length).toBe(0);
  });

  test("permanent modifiers never expire", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "perma",
      stat: "strength",
      type: "flat",
      value: 5,
      // no duration
    });
    const expired = tickModifiers(stats, 1000);
    expect(expired.length).toBe(0);
    expect(stats.modifiers.length).toBe(1);
    expect(getStat(stats, "strength")).toBe(15);
  });

  test("mixes timed and permanent modifiers correctly", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "perma",
      stat: "strength",
      type: "flat",
      value: 5,
    });
    addModifier(stats, {
      id: "timed",
      stat: "strength",
      type: "flat",
      value: 3,
      duration: 2,
    });
    tickModifiers(stats, 1);
    expect(stats.modifiers.length).toBe(2);
    const expired = tickModifiers(stats, 2);
    expect(expired.length).toBe(1);
    expect(expired[0].id).toBe("timed");
    expect(stats.modifiers.length).toBe(1);
    expect(stats.modifiers[0].id).toBe("perma");
  });

  test("addModifier sets _remaining when duration is provided", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 7,
    });
    expect(stats.modifiers[0]._remaining).toBe(7);
  });

  test("returns empty array when dt is zero or negative", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 5,
    });
    expect(tickModifiers(stats, 0)).toEqual([]);
    expect(tickModifiers(stats, -1)).toEqual([]);
    // Timer unchanged.
    expect(stats.modifiers[0]._remaining).toBe(5);
  });

  test("returns empty array when no modifiers are active", () => {
    const stats = createStats({ strength: 10 });
    expect(tickModifiers(stats, 1)).toEqual([]);
  });
});

// ── serialize / deserialize ────────────────────────────────────

describe("serializeStats / deserializeStats", () => {
  test("round-trips base values", () => {
    const stats = createStats({ strength: 10, maxHp: 100 });
    const restored = deserializeStats(serializeStats(stats));
    expect(restored.base).toEqual({ strength: 10, maxHp: 100 });
    expect(restored.modifiers).toEqual([]);
  });

  test("round-trips modifiers", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      source: "ring",
    });
    addModifier(stats, {
      id: "m2",
      stat: "strength",
      type: "percent",
      value: 0.2,
      duration: 10,
      source: "buff",
      stacking: "refresh",
    });
    tickModifiers(stats, 3);

    const data = serializeStats(stats);
    const restored = deserializeStats(data);
    expect(getStat(restored, "strength")).toBeCloseTo(getStat(stats, "strength"), 5);
    expect(restored.modifiers.length).toBe(2);
    const m2 = restored.modifiers.find((m) => m.id === "m2");
    expect(m2?._remaining).toBeCloseTo(7, 5);
    expect(m2?.stacking).toBe("refresh");
  });

  test("deserialize is resilient to missing fields", () => {
    const restored = deserializeStats({});
    expect(restored.base).toEqual({});
    expect(restored.modifiers).toEqual([]);
  });

  test("serialize produces a plain object that survives JSON round-trip", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "m1",
      stat: "strength",
      type: "flat",
      value: 5,
      duration: 4,
    });
    const json = JSON.parse(JSON.stringify(serializeStats(stats)));
    const restored = deserializeStats(json);
    expect(getStat(restored, "strength")).toBe(15);
    expect(restored.modifiers[0]._remaining).toBe(4);
  });

  test("serialize does not alias internal arrays", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "m1", stat: "strength", type: "flat", value: 5 });
    const data = serializeStats(stats);
    (data.modifiers as any[]).push({ id: "rogue", stat: "strength", type: "flat", value: 999 });
    expect(stats.modifiers.length).toBe(1);
  });
});

// ── Permanent mods never expire (explicit) ─────────────────────

describe("permanent modifiers", () => {
  test("still apply after many ticks", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, {
      id: "perma",
      stat: "strength",
      type: "flat",
      value: 5,
    });
    for (let i = 0; i < 1000; i++) {
      tickModifiers(stats, 1);
    }
    expect(getStat(stats, "strength")).toBe(15);
  });

  test("_remaining is undefined for permanent mods after add", () => {
    const stats = createStats({ strength: 10 });
    addModifier(stats, { id: "perma", stat: "strength", type: "flat", value: 5 });
    expect(stats.modifiers[0]._remaining).toBeUndefined();
  });
});
