import { describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import {
  canEquip,
  clearEquipment,
  createEquipment,
  deserializeEquipment,
  type EquippableItem,
  equipItem,
  getEquipped,
  isSlotAvailable,
  serializeEquipment,
  unequipItem,
} from "../../behaviors/equipment";
import { addModifier, createStats, getStat } from "../../behaviors/stats";
import { mockEngine } from "../helpers";

// ── Fixtures ────────────────────────────────────────────────────

const shortsword: EquippableItem = {
  id: "shortsword",
  name: "Shortsword",
  icon: "/",
  equipSlot: "weapon",
  modifiers: [{ stat: "attack", type: "flat", value: 5 }],
};

const greatsword: EquippableItem = {
  id: "greatsword",
  name: "Greatsword",
  icon: "|",
  equipSlot: "weapon",
  twoHanded: true,
  modifiers: [{ stat: "attack", type: "flat", value: 15 }],
  requirements: { strength: 10 },
};

const shield: EquippableItem = {
  id: "shield",
  name: "Iron Shield",
  icon: "o",
  equipSlot: "offhand",
  modifiers: [{ stat: "defense", type: "flat", value: 4 }],
};

const helm: EquippableItem = {
  id: "helm",
  name: "Steel Helm",
  icon: "^",
  equipSlot: "head",
  modifiers: [
    { stat: "defense", type: "flat", value: 2 },
    { stat: "maxHp", type: "percent", value: 0.1 },
  ],
};

const chestplate: EquippableItem = {
  id: "chest",
  name: "Chestplate",
  icon: "#",
  equipSlot: "chest",
  modifiers: [{ stat: "defense", type: "flat", value: 8 }],
};

const boots: EquippableItem = {
  id: "boots",
  name: "Unequippable Boots",
  icon: "b",
  equipSlot: "feet",
};

// ── createEquipment ─────────────────────────────────────────────

describe("createEquipment", () => {
  test("creates an equipment with the requested slots all empty", () => {
    const eq = createEquipment(["weapon", "head", "chest"]);
    expect(eq.slots.weapon).toBeNull();
    expect(eq.slots.head).toBeNull();
    expect(eq.slots.chest).toBeNull();
    expect(eq.blocks).toBeUndefined();
  });

  test("stores the blocks map when provided", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    expect(eq.blocks).toEqual({ weapon: ["offhand"] });
  });

  test("does not alias the provided blocks object", () => {
    const blocks = { weapon: ["offhand"] };
    const eq = createEquipment(["weapon", "offhand"], blocks);
    blocks.weapon.push("head");
    // Top-level blocks object copied, inner arrays still referenced.
    expect(eq.blocks?.weapon).toContain("offhand");
    // But pushing a new key shouldn't leak in:
    (blocks as any).ring = ["ring2"];
    expect((eq.blocks as any).ring).toBeUndefined();
  });

  test("handles empty slot list", () => {
    const eq = createEquipment([]);
    expect(Object.keys(eq.slots).length).toBe(0);
  });
});

// ── isSlotAvailable / getEquipped ──────────────────────────────

describe("isSlotAvailable / getEquipped", () => {
  test("isSlotAvailable is true for known empty slots", () => {
    const eq = createEquipment(["weapon"]);
    expect(isSlotAvailable(eq, "weapon")).toBe(true);
  });

  test("isSlotAvailable is false for unknown slots", () => {
    const eq = createEquipment(["weapon"]);
    expect(isSlotAvailable(eq, "head")).toBe(false);
  });

  test("isSlotAvailable is false after equipping into the slot", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    expect(isSlotAvailable(eq, "weapon")).toBe(false);
  });

  test("getEquipped returns null for empty/unknown slots", () => {
    const eq = createEquipment(["weapon"]);
    expect(getEquipped(eq, "weapon")).toBeNull();
    expect(getEquipped(eq, "tail")).toBeNull();
  });

  test("getEquipped returns the item after equipItem", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    expect(getEquipped(eq, "weapon")?.id).toBe("shortsword");
  });
});

// ── canEquip ────────────────────────────────────────────────────

describe("canEquip", () => {
  test("passes for a valid item in an existing slot", () => {
    const eq = createEquipment(["weapon"]);
    expect(canEquip(eq, shortsword)).toEqual({ ok: true });
  });

  test("fails when the equipment doesn't have the target slot", () => {
    const eq = createEquipment(["head"]);
    const result = canEquip(eq, shortsword);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("weapon");
  });

  test("passes requirement check when stats meet the minimum", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ strength: 10 });
    expect(canEquip(eq, greatsword, stats)).toEqual({ ok: true });
  });

  test("fails requirement check when stats are below the minimum", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ strength: 5 });
    const result = canEquip(eq, greatsword, stats);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/strength/);
    expect(result.reason).toMatch(/10/);
  });

  test("respects modifiers when checking requirements", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ strength: 5 });
    addModifier(stats, { id: "buff", stat: "strength", type: "flat", value: 10 });
    expect(canEquip(eq, greatsword, stats).ok).toBe(true);
  });

  test("skips requirement check when stats are not provided", () => {
    const eq = createEquipment(["weapon"]);
    // No stats → requirement check is skipped.
    expect(canEquip(eq, greatsword).ok).toBe(true);
  });
});

// ── equipItem: basic ────────────────────────────────────────────

describe("equipItem — basic", () => {
  test("equips an item into an empty slot", () => {
    const eq = createEquipment(["weapon"]);
    const displaced = equipItem(eq, shortsword);
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "weapon")?.id).toBe("shortsword");
  });

  test("rejects when slot doesn't exist — no mutation, no displacement", () => {
    const eq = createEquipment(["head"]);
    const displaced = equipItem(eq, shortsword);
    expect(displaced).toEqual([]);
    expect(Object.values(eq.slots).every((s) => s === null)).toBe(true);
  });

  test("rejects when requirements fail — no mutation", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ strength: 5 });
    const displaced = equipItem(eq, greatsword, stats);
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "weapon")).toBeNull();
    expect(stats.modifiers.length).toBe(0);
  });

  test("displaces an existing item when equipping into a filled slot", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    const displaced = equipItem(eq, {
      ...shortsword,
      id: "rapier",
      name: "Rapier",
    });
    expect(displaced.length).toBe(1);
    expect(displaced[0].id).toBe("shortsword");
    expect(getEquipped(eq, "weapon")?.id).toBe("rapier");
  });
});

// ── equipItem: two-handed ──────────────────────────────────────

describe("equipItem — two-handed weapons", () => {
  test("two-handed weapon displaces occupant of the blocked offhand slot", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    equipItem(eq, shield);
    expect(getEquipped(eq, "offhand")?.id).toBe("shield");

    const displaced = equipItem(eq, greatsword);
    expect(displaced.length).toBe(1);
    expect(displaced[0].id).toBe("shield");
    expect(getEquipped(eq, "weapon")?.id).toBe("greatsword");
    expect(getEquipped(eq, "offhand")).toBeNull();
  });

  test("two-handed weapon into empty weapon+offhand produces no displacement", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    const displaced = equipItem(eq, greatsword);
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "weapon")?.id).toBe("greatsword");
  });

  test("replacing a two-handed weapon while offhand is also filled returns BOTH items", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    equipItem(eq, greatsword); // two-handed, fills weapon, blocks offhand (empty)
    // Force shield into offhand to set up a multi-displacement scenario:
    eq.slots.offhand = shield;
    const displaced = equipItem(eq, greatsword);
    // Displaces both the existing greatsword (from weapon) and shield (from offhand).
    expect(displaced.length).toBe(2);
    expect(displaced.map((d) => d.id).sort()).toEqual(["greatsword", "shield"]);
  });

  test("one-handed weapon does NOT clear offhand even if blocks is defined", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    equipItem(eq, shield);
    const displaced = equipItem(eq, shortsword); // one-handed
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "offhand")?.id).toBe("shield");
    expect(getEquipped(eq, "weapon")?.id).toBe("shortsword");
  });

  test("unequipping a two-handed weapon frees the offhand slot for new items", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    equipItem(eq, greatsword);
    unequipItem(eq, "weapon");
    expect(isSlotAvailable(eq, "offhand")).toBe(true);
    const displaced = equipItem(eq, shield);
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "offhand")?.id).toBe("shield");
  });
});

// ── equipItem: stat integration ────────────────────────────────

describe("equipItem — stat integration", () => {
  test("applies each modifier under a unique per-slot id", () => {
    const eq = createEquipment(["head"]);
    const stats = createStats({ defense: 1, maxHp: 100 });
    equipItem(eq, helm, stats);
    expect(stats.modifiers.length).toBe(2);
    const ids = stats.modifiers.map((m) => m.id).sort();
    expect(ids).toEqual(["equip:head:0", "equip:head:1"]);
    expect(stats.modifiers.every((m) => m.source === "equipment:head")).toBe(true);
  });

  test("getStat reflects equipped bonuses", () => {
    const eq = createEquipment(["head", "chest"]);
    const stats = createStats({ defense: 1, maxHp: 100 });
    equipItem(eq, helm, stats);
    equipItem(eq, chestplate, stats);
    // (1 + 2 + 8) * 1 = 11
    expect(getStat(stats, "defense")).toBe(11);
    // 100 * (1 + 0.1) = 110
    expect(getStat(stats, "maxHp")).toBeCloseTo(110, 5);
  });

  test("re-equipping the same slot replaces modifiers cleanly (no stale stacking)", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ attack: 0, strength: 10 });
    equipItem(eq, shortsword, stats); // +5
    equipItem(eq, greatsword, stats); // replaces → +15 only
    expect(getStat(stats, "attack")).toBe(15);
    // Source filter — only one slot worth active.
    expect(stats.modifiers.every((m) => m.source === "equipment:weapon")).toBe(true);
  });

  test("unequipItem removes the item's modifiers", () => {
    const eq = createEquipment(["head"]);
    const stats = createStats({ defense: 1 });
    equipItem(eq, helm, stats);
    expect(getStat(stats, "defense")).toBe(3);
    const removed = unequipItem(eq, "head", stats);
    expect(removed?.id).toBe("helm");
    expect(getStat(stats, "defense")).toBe(1);
    expect(stats.modifiers.length).toBe(0);
  });

  test("items without modifiers apply nothing to stats", () => {
    const eq = createEquipment(["feet"]);
    const stats = createStats({ defense: 3 });
    equipItem(eq, boots, stats);
    expect(stats.modifiers.length).toBe(0);
    expect(getStat(stats, "defense")).toBe(3);
  });

  test("when stats is omitted, modifiers are not applied but equip still succeeds", () => {
    const eq = createEquipment(["head"]);
    const displaced = equipItem(eq, helm); // no stats
    expect(displaced).toEqual([]);
    expect(getEquipped(eq, "head")?.id).toBe("helm");
  });

  test("two-handed unequip clears both slots' modifiers", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    const stats = createStats({ attack: 0, defense: 0, strength: 10 });
    equipItem(eq, shield, stats); // +4 defense
    expect(getStat(stats, "defense")).toBe(4);
    // Equip greatsword → displaces shield (strips +4 defense), adds +15 attack.
    equipItem(eq, greatsword, stats);
    expect(getStat(stats, "defense")).toBe(0);
    expect(getStat(stats, "attack")).toBe(15);
  });
});

// ── unequipItem ─────────────────────────────────────────────────

describe("unequipItem", () => {
  test("returns the removed item and clears the slot", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    const removed = unequipItem(eq, "weapon");
    expect(removed?.id).toBe("shortsword");
    expect(getEquipped(eq, "weapon")).toBeNull();
  });

  test("returns null when the slot is empty", () => {
    const eq = createEquipment(["weapon"]);
    expect(unequipItem(eq, "weapon")).toBeNull();
  });

  test("returns null for unknown slots", () => {
    const eq = createEquipment(["weapon"]);
    expect(unequipItem(eq, "tail")).toBeNull();
  });
});

// ── clearEquipment ──────────────────────────────────────────────

describe("clearEquipment", () => {
  test("empties every slot and returns all equipped items", () => {
    const eq = createEquipment(["weapon", "head", "chest"]);
    equipItem(eq, shortsword);
    equipItem(eq, helm);
    equipItem(eq, chestplate);
    const removed = clearEquipment(eq);
    expect(removed.length).toBe(3);
    expect(removed.map((i) => i.id).sort()).toEqual(["chest", "helm", "shortsword"]);
    for (const slotId of Object.keys(eq.slots)) {
      expect(eq.slots[slotId]).toBeNull();
    }
  });

  test("removes every equipment modifier from stats", () => {
    const eq = createEquipment(["weapon", "head"]);
    const stats = createStats({ attack: 0, defense: 1, maxHp: 100 });
    equipItem(eq, shortsword, stats);
    equipItem(eq, helm, stats);
    expect(stats.modifiers.length).toBe(3);
    clearEquipment(eq, stats);
    expect(stats.modifiers.length).toBe(0);
    expect(getStat(stats, "attack")).toBe(0);
    expect(getStat(stats, "defense")).toBe(1);
  });

  test("returns an empty array when nothing is equipped", () => {
    const eq = createEquipment(["weapon"]);
    expect(clearEquipment(eq)).toEqual([]);
  });
});

// ── Event emission ──────────────────────────────────────────────

describe("event emission", () => {
  test("equipItem emits equipment:equip only when engine is supplied", () => {
    const eq = createEquipment(["weapon"]);
    const engine = mockEngine();

    const silent: any[] = [];
    const loud: any[] = [];
    const silentHandler = (e: any) => silent.push(e);
    const loudHandler = (e: any) => loud.push(e);

    events.on("equipment:equip" as any, silentHandler);
    equipItem(eq, shortsword); // no engine → no event
    events.off("equipment:equip" as any, silentHandler);

    events.on("equipment:equip" as any, loudHandler);
    equipItem(
      createEquipment(["weapon"]),
      shortsword,
      undefined,
      engine as any,
      { tags: { values: new Set() } } as any,
    );
    events.off("equipment:equip" as any, loudHandler);

    expect(silent.length).toBe(0);
    expect(loud.length).toBe(1);
    expect(loud[0].slotId).toBe("weapon");
    expect(loud[0].item.id).toBe("shortsword");
  });

  test("unequipItem emits equipment:unequip when engine is supplied", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("equipment:unequip" as any, handler);
    unequipItem(eq, "weapon", undefined, engine as any);
    events.off("equipment:unequip" as any, handler);

    expect(received.length).toBe(1);
    expect(received[0].slotId).toBe("weapon");
    expect(received[0].item.id).toBe("shortsword");
  });

  test("displacing a two-handed equip emits unequip+equip in order", () => {
    const eq = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
    equipItem(eq, shield);
    const engine = mockEngine();

    const seen: Array<{ type: string; slot: string; id: string }> = [];
    const equipHandler = (e: any) => seen.push({ type: "equip", slot: e.slotId, id: e.item.id });
    const unequipHandler = (e: any) =>
      seen.push({ type: "unequip", slot: e.slotId, id: e.item.id });

    events.on("equipment:equip" as any, equipHandler);
    events.on("equipment:unequip" as any, unequipHandler);
    equipItem(eq, greatsword, undefined, engine as any);
    events.off("equipment:equip" as any, equipHandler);
    events.off("equipment:unequip" as any, unequipHandler);

    // Shield displaced from offhand, greatsword equipped into weapon.
    expect(seen).toEqual([
      { type: "unequip", slot: "offhand", id: "shield" },
      { type: "equip", slot: "weapon", id: "greatsword" },
    ]);
  });

  test("clearEquipment emits an unequip per occupied slot", () => {
    const eq = createEquipment(["weapon", "head"]);
    equipItem(eq, shortsword);
    equipItem(eq, helm);
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("equipment:unequip" as any, handler);
    clearEquipment(eq, undefined, engine as any);
    events.off("equipment:unequip" as any, handler);

    expect(received.length).toBe(2);
    expect(received.map((e) => e.item.id).sort()).toEqual(["helm", "shortsword"]);
  });
});

// ── serialize / deserialize ────────────────────────────────────

describe("serializeEquipment / deserializeEquipment", () => {
  test("round-trips equipped items via an item lookup", () => {
    const eq = createEquipment(["weapon", "head", "chest"]);
    equipItem(eq, shortsword);
    equipItem(eq, helm);

    const data = serializeEquipment(eq);
    expect(data).toEqual({
      slots: { weapon: "shortsword", head: "helm", chest: null },
    });

    const registry: Record<string, EquippableItem> = {
      shortsword,
      helm,
      chest: chestplate,
    };
    const restored = deserializeEquipment(data, (id) => registry[id]);
    expect(getEquipped(restored, "weapon")?.id).toBe("shortsword");
    expect(getEquipped(restored, "head")?.id).toBe("helm");
    expect(getEquipped(restored, "chest")).toBeNull();
  });

  test("survives a JSON round-trip", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    const json = JSON.parse(JSON.stringify(serializeEquipment(eq)));
    const restored = deserializeEquipment(json, (id) =>
      id === "shortsword" ? shortsword : undefined,
    );
    expect(getEquipped(restored, "weapon")?.id).toBe("shortsword");
  });

  test("missing lookup results in an empty slot (not a crash)", () => {
    const eq = createEquipment(["weapon"]);
    equipItem(eq, shortsword);
    const data = serializeEquipment(eq);
    const restored = deserializeEquipment(data, () => undefined);
    expect(getEquipped(restored, "weapon")).toBeNull();
    expect("weapon" in restored.slots).toBe(true);
  });

  test("deserialize tolerates malformed input", () => {
    const restored = deserializeEquipment({} as any, () => undefined);
    expect(restored.slots).toEqual({});
  });

  test("reapplies modifiers to stats when passed on deserialize", () => {
    const eq = createEquipment(["weapon", "head"]);
    const stats = createStats({ attack: 3, defense: 0, maxHp: 100 });
    equipItem(eq, shortsword, stats);
    equipItem(eq, helm, stats);
    expect(getStat(stats, "attack")).toBe(8);
    expect(getStat(stats, "defense")).toBe(2);

    const data = serializeEquipment(eq);
    const freshStats = createStats({ attack: 3, defense: 0, maxHp: 100 });
    const restored = deserializeEquipment(
      data,
      (id) => (({ shortsword, helm }) as Record<string, EquippableItem>)[id],
      freshStats,
    );
    expect(getStat(freshStats, "attack")).toBe(8);
    expect(getStat(freshStats, "defense")).toBe(2);
    expect(getStat(freshStats, "maxHp")).toBeCloseTo(110);
    expect(getEquipped(restored, "weapon")?.id).toBe("shortsword");
  });

  test("restores blocks map when passed on deserialize", () => {
    const eq = createEquipment(["weapon", "offhand"], {
      weapon: ["offhand"],
    });
    equipItem(eq, greatsword, createStats({ strength: 10 }));
    const data = serializeEquipment(eq);
    const restored = deserializeEquipment(
      data,
      (id) => (id === "greatsword" ? greatsword : undefined),
      undefined,
      { weapon: ["offhand"] },
    );
    expect(restored.blocks).toEqual({ weapon: ["offhand"] });
  });

  test("omitting stats leaves modifiers unapplied (opt-in semantics)", () => {
    const eq = createEquipment(["weapon"]);
    const stats = createStats({ attack: 3 });
    equipItem(eq, shortsword, stats);
    const data = serializeEquipment(eq);

    const freshStats = createStats({ attack: 3 });
    deserializeEquipment(data, (id) => (id === "shortsword" ? shortsword : undefined));
    expect(getStat(freshStats, "attack")).toBe(3);
  });
});
