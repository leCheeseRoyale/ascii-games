import { describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import { canCraft, craft, type Recipe, RecipeBook } from "../../behaviors/crafting";
import {
  addItem,
  countItem,
  createInventory,
  hasItem,
  type InventoryItem,
} from "../../behaviors/inventory";
import { createSeededRandom } from "../../behaviors/loot";
import { mockEngine } from "../helpers";

// ── Fixtures ────────────────────────────────────────────────────

const iron: InventoryItem = {
  id: "iron",
  name: "Iron Ingot",
  icon: "#",
  stackable: true,
  maxStack: 99,
};

const wood: InventoryItem = {
  id: "wood",
  name: "Wood Plank",
  icon: "=",
  stackable: true,
  maxStack: 99,
};

const anvil: InventoryItem = {
  id: "anvil",
  name: "Anvil",
  icon: "A",
  stackable: false,
};

const ironSword: InventoryItem = {
  id: "iron_sword",
  name: "Iron Sword",
  icon: "/",
  damage: 10,
};

const scrap: InventoryItem = {
  id: "scrap",
  name: "Scrap Metal",
  icon: ".",
  stackable: true,
  maxStack: 99,
};

const gem: InventoryItem = {
  id: "gem",
  name: "Gem",
  icon: "*",
  stackable: true,
  maxStack: 99,
};

// Lookup used by most tests — returns the full item definition by id.
const itemLookup = (id: string): InventoryItem | undefined => {
  const db: Record<string, InventoryItem> = {
    iron,
    wood,
    anvil,
    iron_sword: ironSword,
    scrap,
    gem,
  };
  return db[id];
};

// Canonical sword recipe used across many tests.
const swordRecipe: Recipe = {
  id: "iron_sword",
  name: "Iron Sword",
  ingredients: [
    { itemId: "iron", count: 3 },
    { itemId: "wood", count: 1 },
    { itemId: "anvil", count: 1, consumed: false },
  ],
  outputs: [{ itemId: "iron_sword" }],
  category: "weapon",
  xp: 20,
};

// Helper — stock an inventory with every ingredient for the sword recipe.
function stockedInventory() {
  const inv = createInventory();
  addItem(inv, iron, 5);
  addItem(inv, wood, 2);
  addItem(inv, anvil, 1);
  return inv;
}

// ── RecipeBook ──────────────────────────────────────────────────

describe("RecipeBook", () => {
  test("register and get retrieves the same recipe", () => {
    const book = new RecipeBook();
    book.register(swordRecipe);
    expect(book.get("iron_sword")).toBe(swordRecipe);
  });

  test("get returns undefined for unknown ids", () => {
    const book = new RecipeBook();
    expect(book.get("nonexistent")).toBeUndefined();
  });

  test("unregister removes the recipe", () => {
    const book = new RecipeBook();
    book.register(swordRecipe);
    expect(book.unregister("iron_sword")).toBe(true);
    expect(book.get("iron_sword")).toBeUndefined();
  });

  test("unregister returns false for unknown ids", () => {
    const book = new RecipeBook();
    expect(book.unregister("nope")).toBe(false);
  });

  test("register replaces existing recipe with same id", () => {
    const book = new RecipeBook();
    book.register(swordRecipe);
    const v2: Recipe = { ...swordRecipe, name: "Better Iron Sword" };
    book.register(v2);
    expect(book.get("iron_sword")?.name).toBe("Better Iron Sword");
    expect(book.size).toBe(1);
  });

  test("all returns every registered recipe", () => {
    const book = new RecipeBook();
    book.register(swordRecipe);
    book.register({ ...swordRecipe, id: "other", name: "Other" });
    const all = book.all();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.id).sort()).toEqual(["iron_sword", "other"]);
  });

  test("byCategory filters by category tag", () => {
    const book = new RecipeBook();
    book.register(swordRecipe); // weapon
    book.register({
      ...swordRecipe,
      id: "axe",
      category: "weapon",
    });
    book.register({
      ...swordRecipe,
      id: "bread",
      category: "food",
    });
    const weapons = book.byCategory("weapon");
    expect(weapons.length).toBe(2);
    expect(weapons.map((r) => r.id).sort()).toEqual(["axe", "iron_sword"]);
    expect(book.byCategory("food").map((r) => r.id)).toEqual(["bread"]);
    expect(book.byCategory("missing")).toEqual([]);
  });

  test("findByOutput returns recipes that produce an item", () => {
    const book = new RecipeBook();
    book.register(swordRecipe); // outputs iron_sword
    book.register({
      id: "smelt",
      name: "Smelt",
      ingredients: [{ itemId: "scrap", count: 2 }],
      outputs: [{ itemId: "iron" }],
    });
    book.register({
      id: "polish",
      name: "Polish",
      ingredients: [{ itemId: "iron", count: 1 }],
      outputs: [{ itemId: "iron" }, { itemId: "gem" }],
    });
    const ironMakers = book.findByOutput("iron");
    expect(ironMakers.map((r) => r.id).sort()).toEqual(["polish", "smelt"]);
    expect(book.findByOutput("iron_sword").map((r) => r.id)).toEqual(["iron_sword"]);
    expect(book.findByOutput("missing")).toEqual([]);
  });

  test("findByIngredient returns recipes that use an item", () => {
    const book = new RecipeBook();
    book.register(swordRecipe); // uses iron, wood, anvil
    const ironUsers = book.findByIngredient("iron");
    expect(ironUsers.map((r) => r.id)).toEqual(["iron_sword"]);
    expect(book.findByIngredient("anvil").map((r) => r.id)).toEqual(["iron_sword"]);
    expect(book.findByIngredient("missing")).toEqual([]);
  });

  test("size and clear behave as expected", () => {
    const book = new RecipeBook();
    expect(book.size).toBe(0);
    book.register(swordRecipe);
    book.register({ ...swordRecipe, id: "other" });
    expect(book.size).toBe(2);
    book.clear();
    expect(book.size).toBe(0);
    expect(book.all()).toEqual([]);
  });

  test("RecipeBook.canCraft delegates to the pure helper", () => {
    const book = new RecipeBook();
    book.register(swordRecipe);
    const inv = stockedInventory();
    const result = book.canCraft(swordRecipe, inv);
    expect(result.ok).toBe(true);
  });
});

// ── canCraft ────────────────────────────────────────────────────

describe("canCraft", () => {
  test("ok when all ingredients are present", () => {
    const inv = stockedInventory();
    const result = canCraft(swordRecipe, inv);
    expect(result.ok).toBe(true);
    expect(result.missing).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  test("reports missing ingredient with shortfall count", () => {
    const inv = createInventory();
    addItem(inv, iron, 1); // need 3
    addItem(inv, wood, 1);
    addItem(inv, anvil, 1);
    const result = canCraft(swordRecipe, inv);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Missing ingredients");
    expect(result.missing).toEqual([{ itemId: "iron", count: 2 }]);
  });

  test("reports all missing ingredients at once", () => {
    const inv = createInventory();
    // Nothing added — everything missing.
    const result = canCraft(swordRecipe, inv);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      { itemId: "iron", count: 3 },
      { itemId: "wood", count: 1 },
      { itemId: "anvil", count: 1 },
    ]);
  });

  test("tool ingredients are required for canCraft (absence fails)", () => {
    const inv = createInventory();
    addItem(inv, iron, 3);
    addItem(inv, wood, 1);
    // No anvil!
    const result = canCraft(swordRecipe, inv);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ itemId: "anvil", count: 1 }]);
  });

  test("skill gate passes when level is sufficient", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 5,
    };
    const inv = stockedInventory();
    expect(canCraft(recipe, inv, { smithing: 5 }).ok).toBe(true);
    expect(canCraft(recipe, inv, { smithing: 10 }).ok).toBe(true);
  });

  test("skill gate fails when level is insufficient", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 5,
    };
    const inv = stockedInventory();
    const result = canCraft(recipe, inv, { smithing: 3 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("smithing");
    expect(result.reason).toContain("level 5");
  });

  test("skill gate fails when skill is missing entirely", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 5,
    };
    const inv = stockedInventory();
    // No skills record at all.
    expect(canCraft(recipe, inv).ok).toBe(false);
    // Empty skills record.
    expect(canCraft(recipe, inv, {}).ok).toBe(false);
  });

  test("skill requirement with level 0 is a no-op", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 0,
    };
    const inv = stockedInventory();
    // Even with no skills record, level 0 passes.
    expect(canCraft(recipe, inv).ok).toBe(true);
  });

  test("skill gate is checked before missing ingredients", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 5,
    };
    const inv = createInventory(); // nothing
    const result = canCraft(recipe, inv, { smithing: 1 });
    // Skill failure short-circuits — no `missing` list populated.
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("smithing");
    expect(result.missing).toBeUndefined();
  });
});

// ── craft — happy path ────────────────────────────────────────

describe("craft (success)", () => {
  test("consumes ingredients and produces output", () => {
    const inv = stockedInventory();
    const result = craft(swordRecipe, inv, itemLookup);

    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe("iron_sword");

    // Iron: 5 - 3 = 2
    expect(countItem(inv, "iron")).toBe(2);
    // Wood: 2 - 1 = 1
    expect(countItem(inv, "wood")).toBe(1);
    // Anvil: not consumed (tool)
    expect(countItem(inv, "anvil")).toBe(1);
    // Sword added to inventory
    expect(hasItem(inv, "iron_sword")).toBe(true);
  });

  test("consumed list reflects actual removed counts (excludes tools)", () => {
    const inv = stockedInventory();
    const result = craft(swordRecipe, inv, itemLookup);

    // Should list iron and wood, but NOT the anvil (it's a tool).
    expect(result.consumed).toEqual([
      { itemId: "iron", count: 3 },
      { itemId: "wood", count: 1 },
    ]);
  });

  test("tool ingredients remain in inventory after craft", () => {
    const inv = stockedInventory();
    craft(swordRecipe, inv, itemLookup);
    expect(countItem(inv, "anvil")).toBe(1);
  });

  test("xpGained comes from recipe.xp", () => {
    const inv = stockedInventory();
    const result = craft(swordRecipe, inv, itemLookup);
    expect(result.xpGained).toBe(20);
  });

  test("xpGained is undefined when recipe has no xp field", () => {
    const recipe: Recipe = { ...swordRecipe, xp: undefined };
    const inv = stockedInventory();
    const result = craft(recipe, inv, itemLookup);
    expect(result.xpGained).toBeUndefined();
  });

  test("output count defaults to 1, respects custom values", () => {
    const recipe: Recipe = {
      id: "ore_smelt",
      name: "Smelt Ore",
      ingredients: [{ itemId: "scrap", count: 1 }],
      outputs: [{ itemId: "iron", count: 5 }],
    };
    const inv = createInventory();
    addItem(inv, scrap, 1);
    const result = craft(recipe, inv, itemLookup);
    expect(result.success).toBe(true);
    expect(countItem(inv, "iron")).toBe(5);
  });

  test("itemLookup returning undefined silently skips that output", () => {
    const recipe: Recipe = {
      id: "mystery",
      name: "Mystery",
      ingredients: [{ itemId: "iron", count: 1 }],
      outputs: [{ itemId: "unknown_item" }, { itemId: "iron_sword" }],
    };
    const inv = createInventory();
    addItem(inv, iron, 1);

    const result = craft(recipe, inv, itemLookup);
    // Still a success, but only the valid output was produced.
    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe("iron_sword");
    expect(countItem(inv, "iron")).toBe(0);
  });
});

// ── craft — failure paths ────────────────────────────────────

describe("craft (failure)", () => {
  test("returns failure with reason when ingredients missing", () => {
    const inv = createInventory(); // empty
    const result = craft(swordRecipe, inv, itemLookup);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Missing ingredients");
    expect(result.items).toEqual([]);
    expect(result.consumed).toEqual([]);
    // Nothing changed.
    expect(inv.slots.length).toBe(0);
  });

  test("missing-ingredient failure leaves existing items untouched", () => {
    const inv = createInventory();
    addItem(inv, iron, 2); // short by 1 iron
    addItem(inv, wood, 1);
    addItem(inv, anvil, 1);

    const result = craft(swordRecipe, inv, itemLookup);
    expect(result.success).toBe(false);
    expect(countItem(inv, "iron")).toBe(2); // unchanged
    expect(countItem(inv, "wood")).toBe(1);
    expect(countItem(inv, "anvil")).toBe(1);
  });

  test("skill gate failure blocks craft without consuming anything", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 10,
    };
    const inv = stockedInventory();
    const result = craft(recipe, inv, itemLookup, { skills: { smithing: 3 } });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("smithing");
    expect(countItem(inv, "iron")).toBe(5); // no consumption
    expect(countItem(inv, "wood")).toBe(2);
  });

  test("successChance < 1 that fails: ingredients consumed, no output", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      successChance: 0.5,
    };
    const inv = stockedInventory();
    // rng() returns 0.9, which is >= 0.5 → failure
    const rng = () => 0.9;

    const result = craft(recipe, inv, itemLookup, { rng });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("Craft failed");
    expect(result.items).toEqual([]);
    // Ingredients were still consumed (recipe burned).
    expect(result.consumed).toEqual([
      { itemId: "iron", count: 3 },
      { itemId: "wood", count: 1 },
    ]);
    expect(countItem(inv, "iron")).toBe(2);
    expect(countItem(inv, "wood")).toBe(1);
    expect(countItem(inv, "anvil")).toBe(1); // tool untouched
    // No sword was produced.
    expect(hasItem(inv, "iron_sword")).toBe(false);
  });

  test("successChance < 1 that passes produces output", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      successChance: 0.5,
    };
    const inv = stockedInventory();
    // rng() returns 0.1, which is < 0.5 → success
    const rng = () => 0.1;

    const result = craft(recipe, inv, itemLookup, { rng });
    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(hasItem(inv, "iron_sword")).toBe(true);
  });
});

// ── craft — multi-output with independent chances ────────────

describe("craft multi-output", () => {
  const multiRecipe: Recipe = {
    id: "prospect",
    name: "Prospect",
    ingredients: [{ itemId: "scrap", count: 1 }],
    outputs: [
      { itemId: "iron", chance: 1 }, // always produced
      { itemId: "gem", chance: 0.5 }, // 50% chance
    ],
  };

  test("all outputs produced when all rolls pass", () => {
    const inv = createInventory();
    addItem(inv, scrap, 1);
    // rng returns 0.1 on the gem roll, which is < 0.5 → produced.
    const rng = () => 0.1;

    const result = craft(multiRecipe, inv, itemLookup, { rng });
    expect(result.success).toBe(true);
    expect(result.items.length).toBe(2);
    expect(hasItem(inv, "iron")).toBe(true);
    expect(hasItem(inv, "gem")).toBe(true);
  });

  test("per-output chance can skip individual outputs", () => {
    const inv = createInventory();
    addItem(inv, scrap, 1);
    // rng returns 0.9 on the gem roll, which is >= 0.5 → gem skipped.
    const rng = () => 0.9;

    const result = craft(multiRecipe, inv, itemLookup, { rng });
    expect(result.success).toBe(true);
    // Only iron was produced, gem was skipped.
    expect(result.items.map((i) => i.id)).toEqual(["iron"]);
    expect(hasItem(inv, "iron")).toBe(true);
    expect(hasItem(inv, "gem")).toBe(false);
  });

  test("deterministic seeded rng reproduces the same outputs", () => {
    // Run twice with fresh stock each time and the same seed — outputs match.
    const runWithSeed = (seed: number) => {
      const inv = createInventory();
      addItem(inv, scrap, 1);
      const result = craft(multiRecipe, inv, itemLookup, {
        rng: createSeededRandom(seed),
      });
      return result.items.map((i) => i.id);
    };
    expect(runWithSeed(42)).toEqual(runWithSeed(42));
    expect(runWithSeed(99)).toEqual(runWithSeed(99));
  });

  test("all per-output rolls can fail for zero items (craft still succeeds)", () => {
    const allChanceRecipe: Recipe = {
      id: "risky",
      name: "Risky",
      ingredients: [{ itemId: "scrap", count: 1 }],
      outputs: [
        { itemId: "iron", chance: 0.1 },
        { itemId: "gem", chance: 0.1 },
      ],
    };
    const inv = createInventory();
    addItem(inv, scrap, 1);
    const rng = () => 0.9; // always >= 0.1 → everything fails

    const result = craft(allChanceRecipe, inv, itemLookup, { rng });
    // Craft succeeded (the *recipe* didn't burn), but no items were produced.
    expect(result.success).toBe(true);
    expect(result.items).toEqual([]);
    // Ingredients still consumed.
    expect(countItem(inv, "scrap")).toBe(0);
  });
});

// ── Events ──────────────────────────────────────────────────────

describe("events", () => {
  test("craft:complete fires on success with engine", () => {
    const inv = stockedInventory();
    const engine = mockEngine();
    const received: any[] = [];
    const handler = (e: any) => received.push(e);

    events.on("craft:complete" as any, handler);
    const result = craft(swordRecipe, inv, itemLookup, {
      engine: engine,
      entity: { tags: { values: new Set() } } as any,
    });
    events.off("craft:complete" as any, handler);

    expect(result.success).toBe(true);
    expect(received.length).toBe(1);
    expect(received[0].recipeId).toBe("iron_sword");
    expect(received[0].items.length).toBe(1);
    expect(received[0].items[0].id).toBe("iron_sword");
    expect(received[0].consumed).toEqual([
      { itemId: "iron", count: 3 },
      { itemId: "wood", count: 1 },
    ]);
    expect(received[0].xpGained).toBe(20);
  });

  test("craft:failed fires on missing ingredients with engine", () => {
    const inv = createInventory();
    const engine = mockEngine();
    const received: any[] = [];
    const handler = (e: any) => received.push(e);

    events.on("craft:failed" as any, handler);
    craft(swordRecipe, inv, itemLookup, { engine: engine });
    events.off("craft:failed" as any, handler);

    expect(received.length).toBe(1);
    expect(received[0].recipeId).toBe("iron_sword");
    expect(received[0].reason).toBe("Missing ingredients");
    expect(received[0].missing).toBeDefined();
  });

  test("craft:failed fires when success roll fails", () => {
    const recipe: Recipe = { ...swordRecipe, successChance: 0.1 };
    const inv = stockedInventory();
    const engine = mockEngine();
    const received: any[] = [];
    const handler = (e: any) => received.push(e);

    events.on("craft:failed" as any, handler);
    craft(recipe, inv, itemLookup, {
      engine: engine,
      rng: () => 0.9, // 0.9 >= 0.1 → failure
    });
    events.off("craft:failed" as any, handler);

    expect(received.length).toBe(1);
    expect(received[0].reason).toBe("Craft failed");
    expect(received[0].consumed).toBeDefined();
  });

  test("no events fire when engine is not supplied", () => {
    const inv = stockedInventory();
    const received: any[] = [];
    const handler = (e: any) => received.push(e);

    events.on("craft:complete" as any, handler);
    events.on("craft:failed" as any, handler);
    craft(swordRecipe, inv, itemLookup); // no engine
    events.off("craft:complete" as any, handler);
    events.off("craft:failed" as any, handler);

    expect(received.length).toBe(0);
  });
});

// ── Edge cases ─────────────────────────────────────────────────

describe("edge cases", () => {
  test("successChance of 0 always fails (ingredients consumed)", () => {
    const recipe: Recipe = { ...swordRecipe, successChance: 0 };
    const inv = stockedInventory();
    const result = craft(recipe, inv, itemLookup);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("Craft failed");
    // Still consumed.
    expect(countItem(inv, "iron")).toBe(2);
  });

  test("successChance of 1 never fails the roll", () => {
    const recipe: Recipe = { ...swordRecipe, successChance: 1 };
    const inv = stockedInventory();
    // Even an rng that returns 0.9999 (very close to 1) should succeed.
    const result = craft(recipe, inv, itemLookup, { rng: () => 0.9999 });
    expect(result.success).toBe(true);
  });

  test("output with count 0 produces no item but craft succeeds", () => {
    const recipe: Recipe = {
      id: "nothing",
      name: "Nothing",
      ingredients: [{ itemId: "iron", count: 1 }],
      outputs: [{ itemId: "iron_sword", count: 0 }],
    };
    const inv = createInventory();
    addItem(inv, iron, 1);
    const result = craft(recipe, inv, itemLookup);
    expect(result.success).toBe(true);
    expect(result.items).toEqual([]);
  });

  test("recipe with empty outputs produces no items", () => {
    const recipe: Recipe = {
      id: "empty",
      name: "Empty",
      ingredients: [{ itemId: "iron", count: 1 }],
      outputs: [],
    };
    const inv = createInventory();
    addItem(inv, iron, 1);
    const result = craft(recipe, inv, itemLookup);
    expect(result.success).toBe(true);
    expect(result.items).toEqual([]);
    // Ingredient consumed.
    expect(countItem(inv, "iron")).toBe(0);
  });

  test("explicit consumed:true behaves identically to default", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      ingredients: [
        { itemId: "iron", count: 3, consumed: true },
        { itemId: "wood", count: 1, consumed: true },
        { itemId: "anvil", count: 1, consumed: false },
      ],
    };
    const inv = stockedInventory();
    const result = craft(recipe, inv, itemLookup);
    expect(result.success).toBe(true);
    expect(result.consumed).toEqual([
      { itemId: "iron", count: 3 },
      { itemId: "wood", count: 1 },
    ]);
    expect(countItem(inv, "anvil")).toBe(1);
  });

  test("recipe requiring multiple units of a tool still leaves them untouched", () => {
    // "Hammer" recipe that needs 2 hammers but doesn't consume them.
    const hammerRecipe: Recipe = {
      id: "heavy_craft",
      name: "Heavy Craft",
      ingredients: [
        { itemId: "iron", count: 1 },
        { itemId: "anvil", count: 2, consumed: false },
      ],
      outputs: [{ itemId: "iron_sword" }],
    };
    const inv = createInventory();
    addItem(inv, iron, 1);
    addItem(inv, anvil, 2);
    const result = craft(hammerRecipe, inv, itemLookup);
    expect(result.success).toBe(true);
    expect(countItem(inv, "anvil")).toBe(2); // both retained
  });

  test("skill recipe that passes gate still gets xpGained", () => {
    const recipe: Recipe = {
      ...swordRecipe,
      skill: "smithing",
      skillLevel: 5,
      xp: 50,
    };
    const inv = stockedInventory();
    const result = craft(recipe, inv, itemLookup, { skills: { smithing: 10 } });
    expect(result.success).toBe(true);
    expect(result.xpGained).toBe(50);
  });
});
