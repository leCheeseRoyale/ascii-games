import { describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import {
  addItem,
  clearInventory,
  countItem,
  createInventory,
  findSlot,
  getSlot,
  hasItem,
  type InventoryItem,
  isFull,
  removeItem,
  totalWeight,
  transferItem,
} from "../../behaviors/inventory";
import { mockEngine } from "../helpers";

// ── Fixtures ────────────────────────────────────────────────────

const potion: InventoryItem = {
  id: "potion",
  name: "Health Potion",
  icon: "!",
  stackable: true,
  maxStack: 10,
  heal: 25,
};

const sword: InventoryItem = {
  id: "sword",
  name: "Iron Sword",
  icon: "/",
  stackable: false,
  weight: 5,
  damage: 10,
};

const coin: InventoryItem = {
  id: "coin",
  name: "Gold Coin",
  icon: "o",
  stackable: true,
  maxStack: 99,
  weight: 0.1,
};

// ── createInventory ─────────────────────────────────────────────

describe("createInventory", () => {
  test("creates an empty inventory", () => {
    const inv = createInventory();
    expect(inv.slots).toEqual([]);
    expect(inv.maxSlots).toBeUndefined();
    expect(inv.maxWeight).toBeUndefined();
  });

  test("respects options", () => {
    const inv = createInventory({ maxSlots: 10, maxWeight: 50 });
    expect(inv.maxSlots).toBe(10);
    expect(inv.maxWeight).toBe(50);
  });
});

// ── addItem ─────────────────────────────────────────────────────

describe("addItem", () => {
  test("adds a single non-stackable item", () => {
    const inv = createInventory();
    const ok = addItem(inv, sword);
    expect(ok).toBe(true);
    expect(inv.slots.length).toBe(1);
    expect(inv.slots[0].item.id).toBe("sword");
    expect(inv.slots[0].count).toBe(1);
  });

  test("non-stackable items go into separate slots per unit", () => {
    const inv = createInventory();
    addItem(inv, sword, 3);
    expect(inv.slots.length).toBe(3);
    for (const s of inv.slots) expect(s.count).toBe(1);
  });

  test("stackable items collapse into a single slot when under maxStack", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    addItem(inv, potion, 3);
    expect(inv.slots.length).toBe(1);
    expect(inv.slots[0].count).toBe(8);
  });

  test("stackable items overflow into new slots when exceeding maxStack", () => {
    const inv = createInventory();
    addItem(inv, potion, 15); // maxStack = 10
    expect(inv.slots.length).toBe(2);
    expect(inv.slots[0].count).toBe(10);
    expect(inv.slots[1].count).toBe(5);
  });

  test("addItem tops up existing stack before creating new ones", () => {
    const inv = createInventory();
    addItem(inv, potion, 7);
    addItem(inv, potion, 8); // 3 fills slot 0, 5 goes to slot 1
    expect(inv.slots.length).toBe(2);
    expect(inv.slots[0].count).toBe(10);
    expect(inv.slots[1].count).toBe(5);
  });

  test("different item ids never stack, even when both stackable", () => {
    const inv = createInventory();
    addItem(inv, potion, 3);
    addItem(inv, coin, 5);
    expect(inv.slots.length).toBe(2);
    expect(findSlot(inv, "potion")).toBe(0);
    expect(findSlot(inv, "coin")).toBe(1);
  });

  test("returns false and leaves nothing when count is 0 or negative", () => {
    const inv = createInventory();
    expect(addItem(inv, potion, 0)).toBe(true); // noop succeeds
    expect(addItem(inv, potion, -5)).toBe(true);
    expect(inv.slots.length).toBe(0);
  });

  test("maxSlots blocks overflow additions", () => {
    const inv = createInventory({ maxSlots: 2 });
    expect(addItem(inv, sword)).toBe(true);
    expect(addItem(inv, sword)).toBe(true);
    expect(addItem(inv, sword)).toBe(false); // no room for a third slot
    expect(inv.slots.length).toBe(2);
  });

  test("maxSlots allows topping up existing stackable slots", () => {
    const inv = createInventory({ maxSlots: 1 });
    addItem(inv, potion, 3);
    // Can still add because we're stacking into the existing slot.
    expect(addItem(inv, potion, 4)).toBe(true);
    expect(inv.slots.length).toBe(1);
    expect(inv.slots[0].count).toBe(7);
  });

  test("maxWeight blocks additions over the cap", () => {
    const inv = createInventory({ maxWeight: 10 });
    // sword weighs 5 — can fit two
    expect(addItem(inv, sword)).toBe(true);
    expect(addItem(inv, sword)).toBe(true);
    expect(addItem(inv, sword)).toBe(false);
    expect(inv.slots.length).toBe(2);
  });

  test("zero-weight items ignore the weight cap", () => {
    const inv = createInventory({ maxWeight: 1 });
    // potion has no weight field → weight 0
    expect(addItem(inv, potion, 50)).toBe(true);
    expect(countItem(inv, "potion")).toBe(50);
  });
});

// ── removeItem ──────────────────────────────────────────────────

describe("removeItem", () => {
  test("removes from a single slot", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    const removed = removeItem(inv, "potion", 3);
    expect(removed).toBe(3);
    expect(inv.slots[0].count).toBe(2);
  });

  test("empties slot and removes entry when count reaches 0", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    removeItem(inv, "potion", 5);
    expect(inv.slots.length).toBe(0);
  });

  test("removes across multiple slots, draining largest first", () => {
    const inv = createInventory();
    addItem(inv, potion, 10); // slot 0 = 10
    addItem(inv, potion, 3); // slot 1 = 3
    const removed = removeItem(inv, "potion", 8);
    expect(removed).toBe(8);
    // slot 0 (originally 10) goes first → 10 - 8 = 2, slot 1 untouched
    expect(countItem(inv, "potion")).toBe(5);
  });

  test("returns actual count removed when exceeding available", () => {
    const inv = createInventory();
    addItem(inv, potion, 3);
    const removed = removeItem(inv, "potion", 10);
    expect(removed).toBe(3);
    expect(inv.slots.length).toBe(0);
  });

  test("returns 0 when item not present", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    expect(removeItem(inv, "sword", 1)).toBe(0);
  });

  test("returns 0 for non-positive counts", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    expect(removeItem(inv, "potion", 0)).toBe(0);
    expect(removeItem(inv, "potion", -1)).toBe(0);
    expect(countItem(inv, "potion")).toBe(5);
  });
});

// ── Queries ─────────────────────────────────────────────────────

describe("hasItem / countItem / findSlot / getSlot", () => {
  test("hasItem with and without count", () => {
    const inv = createInventory();
    addItem(inv, potion, 3);
    expect(hasItem(inv, "potion")).toBe(true);
    expect(hasItem(inv, "potion", 3)).toBe(true);
    expect(hasItem(inv, "potion", 4)).toBe(false);
    expect(hasItem(inv, "sword")).toBe(false);
  });

  test("countItem sums across slots", () => {
    const inv = createInventory();
    addItem(inv, potion, 15); // splits into 10 + 5
    expect(countItem(inv, "potion")).toBe(15);
  });

  test("findSlot returns first matching index or -1", () => {
    const inv = createInventory();
    addItem(inv, sword);
    addItem(inv, potion, 3);
    expect(findSlot(inv, "sword")).toBe(0);
    expect(findSlot(inv, "potion")).toBe(1);
    expect(findSlot(inv, "missing")).toBe(-1);
  });

  test("getSlot returns the slot at an index", () => {
    const inv = createInventory();
    addItem(inv, potion, 3);
    expect(getSlot(inv, 0)?.count).toBe(3);
    expect(getSlot(inv, 99)).toBeUndefined();
  });
});

// ── Weight + fullness ───────────────────────────────────────────

describe("totalWeight / isFull", () => {
  test("totalWeight sums slot weights * counts", () => {
    const inv = createInventory();
    addItem(inv, sword, 2); // 5 * 2
    addItem(inv, coin, 10); // 0.1 * 10
    expect(totalWeight(inv)).toBeCloseTo(11, 5);
  });

  test("isFull is false for unbounded inventories", () => {
    const inv = createInventory();
    addItem(inv, potion, 1000);
    expect(isFull(inv)).toBe(false);
  });

  test("isFull respects maxSlots when no stack has room", () => {
    const inv = createInventory({ maxSlots: 2 });
    addItem(inv, sword);
    addItem(inv, sword);
    expect(isFull(inv)).toBe(true);
  });

  test("isFull is false if a slot can still stack", () => {
    const inv = createInventory({ maxSlots: 1 });
    addItem(inv, potion, 3); // stack of 3 out of 10 max
    expect(isFull(inv)).toBe(false);
  });

  test("isFull respects maxWeight", () => {
    const inv = createInventory({ maxWeight: 5 });
    addItem(inv, sword); // weight 5
    expect(isFull(inv)).toBe(true);
  });
});

// ── clearInventory ──────────────────────────────────────────────

describe("clearInventory", () => {
  test("removes all slots", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    addItem(inv, sword, 2);
    clearInventory(inv);
    expect(inv.slots.length).toBe(0);
    expect(totalWeight(inv)).toBe(0);
  });

  test("is idempotent on an empty inventory", () => {
    const inv = createInventory();
    expect(() => clearInventory(inv)).not.toThrow();
  });
});

// ── transferItem ────────────────────────────────────────────────

describe("transferItem", () => {
  test("moves items from one inventory to another", () => {
    const from = createInventory();
    const to = createInventory();
    addItem(from, potion, 5);

    const moved = transferItem(from, to, "potion", 3);
    expect(moved).toBe(3);
    expect(countItem(from, "potion")).toBe(2);
    expect(countItem(to, "potion")).toBe(3);
  });

  test("transfers are capped by source availability", () => {
    const from = createInventory();
    const to = createInventory();
    addItem(from, potion, 2);
    const moved = transferItem(from, to, "potion", 10);
    expect(moved).toBe(2);
    expect(countItem(from, "potion")).toBe(0);
    expect(countItem(to, "potion")).toBe(2);
  });

  test("transfers never destroy items when destination is full", () => {
    const from = createInventory();
    const to = createInventory({ maxSlots: 1 });
    addItem(from, potion, 15); // stacked 10 + 5
    addItem(to, sword); // to is now full (non-stackable, maxSlots=1)

    const moved = transferItem(from, to, "potion", 15);
    expect(moved).toBe(0);
    // Source retains everything.
    expect(countItem(from, "potion")).toBe(15);
    expect(countItem(to, "potion")).toBe(0);
  });

  test("partial transfers when destination has partial capacity", () => {
    const from = createInventory();
    const to = createInventory({ maxSlots: 1 });
    addItem(from, potion, 20);
    // `to` can accept one stack of 10 potions (maxStack = 10)
    const moved = transferItem(from, to, "potion", 20);
    expect(moved).toBe(10);
    expect(countItem(to, "potion")).toBe(10);
    expect(countItem(from, "potion")).toBe(10);
  });

  test("returns 0 when source has none of the requested item", () => {
    const from = createInventory();
    const to = createInventory();
    addItem(from, potion, 5);
    expect(transferItem(from, to, "sword", 1)).toBe(0);
  });

  test("returns 0 for non-positive counts", () => {
    const from = createInventory();
    const to = createInventory();
    addItem(from, potion, 5);
    expect(transferItem(from, to, "potion", 0)).toBe(0);
    expect(transferItem(from, to, "potion", -1)).toBe(0);
  });
});

// ── Event emission (opt-in via engine) ─────────────────────────

describe("event emission", () => {
  test("addItem fires inventory:add only when engine is supplied", () => {
    const inv = createInventory();
    const engine = mockEngine();

    const silent: any[] = [];
    const loud: any[] = [];
    const silentHandler = (e: any) => silent.push(e);
    const loudHandler = (e: any) => loud.push(e);

    events.on("inventory:add", silentHandler);
    addItem(inv, potion, 2); // no engine → no event
    events.off("inventory:add", silentHandler);

    events.on("inventory:add", loudHandler);
    addItem(inv, potion, 3, engine, { tags: { values: new Set() } });
    events.off("inventory:add", loudHandler);

    expect(silent.length).toBe(0);
    expect(loud.length).toBe(1);
    expect(loud[0].count).toBe(3);
    expect(loud[0].item.id).toBe("potion");
  });

  test("removeItem fires inventory:remove when engine is supplied", () => {
    const inv = createInventory();
    addItem(inv, potion, 5);
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("inventory:remove", handler);
    removeItem(inv, "potion", 2, engine);
    events.off("inventory:remove", handler);

    expect(received.length).toBe(1);
    expect(received[0].itemId).toBe("potion");
    expect(received[0].count).toBe(2);
  });

  test("addItem fires inventory:full when capacity blocks the add", () => {
    const inv = createInventory({ maxSlots: 1 });
    addItem(inv, sword);
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("inventory:full", handler);
    const ok = addItem(inv, sword, 1, engine);
    events.off("inventory:full", handler);

    expect(ok).toBe(false);
    expect(received.length).toBe(1);
    expect(received[0].item.id).toBe("sword");
  });
});
