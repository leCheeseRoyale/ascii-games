/**
 * Crafting / recipe behavior — reusable item creation for any game.
 *
 * A `Recipe` maps a list of ingredient items (consumed from an inventory) to
 * one or more output items (added to the same inventory). Recipes can gate
 * on optional skill levels, roll per-recipe `successChance` for failures,
 * and roll per-output `chance` for probabilistic multi-outputs. Tool-style
 * ingredients (`consumed: false`) are checked for presence but not removed.
 *
 * The `RecipeBook` class is an opt-in registry for looking up recipes by id,
 * category, or output item — useful for driving crafting UIs.
 *
 * Skill / XP tracking is advisory: `craft()` returns `xpGained` on success
 * but never mutates any game state directly. Callers decide how to apply
 * the XP (stats system, their own counter, etc.).
 *
 * @example
 * ```ts
 * import { RecipeBook, craft, createInventory, addItem } from '@engine';
 *
 * const book = new RecipeBook();
 * book.register({
 *   id: 'sword',
 *   name: 'Iron Sword',
 *   ingredients: [
 *     { itemId: 'iron', count: 3 },
 *     { itemId: 'wood', count: 1 },
 *     { itemId: 'anvil', count: 1, consumed: false }, // tool
 *   ],
 *   outputs: [{ itemId: 'iron_sword' }],
 *   skill: 'smithing',
 *   skillLevel: 5,
 *   xp: 20,
 *   successChance: 0.9,
 * });
 *
 * const result = craft(
 *   book.get('sword')!,
 *   player.inventory,
 *   (id) => itemDb[id],
 *   { skills: { smithing: 6 }, engine, entity: player },
 * );
 * if (result.success) grantXp(result.xpGained);
 * ```
 */

import { events } from "@shared/events";
import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import {
  addItem,
  countItem,
  type InventoryComponent,
  type InventoryItem,
  removeItem,
} from "./inventory";

// ── Public types ────────────────────────────────────────────────

/** A single ingredient required by a recipe. */
export interface CraftIngredient {
  /** Item id to match against `InventoryComponent`. */
  itemId: string;
  /** How many of the item are required. */
  count: number;
  /**
   * If `false`, the ingredient must be present but is NOT removed on craft
   * (think "anvil" or "hammer"). Default `true`.
   */
  consumed?: boolean;
}

/** A single output produced by a recipe. */
export interface CraftOutput {
  /** Item id — resolved via the caller-supplied `itemLookup`. */
  itemId: string;
  /** How many of the item to produce. Default 1. */
  count?: number;
  /**
   * Per-output success probability (0-1). Each output rolls independently,
   * so a recipe can produce 0, 1, or all outputs. Default 1.
   */
  chance?: number;
}

/** A complete recipe — ingredients → outputs, with optional gating / failure. */
export interface Recipe {
  /** Unique id, used by `RecipeBook.get`. */
  id: string;
  /** Display name for UI. */
  name: string;
  /** Required ingredients (some may be "tools" with `consumed: false`). */
  ingredients: CraftIngredient[];
  /** Outputs produced on successful craft. Each rolls its own `chance`. */
  outputs: CraftOutput[];
  /** Optional craft duration in seconds (default 0 — instant). */
  time?: number;
  /** Optional skill name required (matched against `opts.skills`). */
  skill?: string;
  /** Minimum skill level required (default 0). */
  skillLevel?: number;
  /** XP granted on success. Returned in the result — caller applies it. */
  xp?: number;
  /**
   * Overall success probability (0-1). If this roll fails, ingredients are
   * still consumed but no outputs are produced. Default 1.
   */
  successChance?: number;
  /** Category tag — used by `RecipeBook.byCategory`. */
  category?: string;
  /** Flavor / UI description. */
  description?: string;
}

/** The outcome of a single `craft()` call. */
export interface CraftResult {
  /** True iff the craft completed AND the success roll passed. */
  success: boolean;
  /** Items actually produced (empty when craft failed). */
  items: InventoryItem[];
  /** Ingredients that were actually consumed from the inventory. */
  consumed: Array<{ itemId: string; count: number }>;
  /** XP to award — caller decides how to apply it. Only set on success. */
  xpGained?: number;
  /** Failure reason, present when `success === false`. */
  reason?: string;
}

/** Outcome of `RecipeBook.canCraft` — safe to inspect before attempting. */
export interface CanCraftResult {
  ok: boolean;
  reason?: string;
  /** Missing ingredients with the exact shortfall amount. */
  missing?: Array<{ itemId: string; count: number }>;
}

// ── Pure helpers ────────────────────────────────────────────────

/**
 * Check whether an inventory has everything a recipe needs. Returns the
 * missing ingredient shortfalls when it can't, so UIs can show a helpful
 * "need 2 more iron" message.
 *
 * Tool ingredients (`consumed: false`) are checked for presence like any
 * other ingredient — they just aren't removed on craft.
 *
 * @param recipe     The recipe being evaluated.
 * @param inventory  Source inventory.
 * @param skills     Optional skill-level map (e.g. `{ smithing: 7 }`).
 */
export function canCraft(
  recipe: Recipe,
  inventory: InventoryComponent,
  skills?: Record<string, number>,
): CanCraftResult {
  // Skill gate first — no point listing missing materials if the skill is
  // too low to even attempt the craft.
  if (recipe.skill && (recipe.skillLevel ?? 0) > 0) {
    const level = skills?.[recipe.skill] ?? 0;
    const needed = recipe.skillLevel ?? 0;
    if (level < needed) {
      return {
        ok: false,
        reason: `Requires ${recipe.skill} level ${needed} (have ${level})`,
      };
    }
  }

  // Collect shortfalls across all ingredients.
  const missing: Array<{ itemId: string; count: number }> = [];
  for (const ing of recipe.ingredients) {
    const have = countItem(inventory, ing.itemId);
    if (have < ing.count) {
      missing.push({ itemId: ing.itemId, count: ing.count - have });
    }
  }

  if (missing.length > 0) {
    return { ok: false, reason: "Missing ingredients", missing };
  }

  return { ok: true };
}

/**
 * Attempt to craft a recipe.
 *
 * Order of operations:
 *   1. `canCraft` — if it fails, nothing changes and the reason is returned.
 *   2. Roll `successChance` (if set). If it fails, consumed ingredients are
 *      still removed (recipe burned) but no outputs are produced. A
 *      `craft:failed` event fires when an engine is supplied.
 *   3. Remove every ingredient with `consumed !== false` via `removeItem`.
 *   4. For each output, roll `chance`. If it passes, call `itemLookup` and
 *      add the item to the inventory.
 *   5. Fire `craft:complete` with the full result payload.
 *
 * Skills are *not* mutated — the caller reads `result.xpGained` and applies
 * XP however it likes (stats system, their own counter, etc.).
 *
 * @param recipe      Recipe to craft.
 * @param inventory   Source + destination inventory.
 * @param itemLookup  Resolves an output `itemId` to an `InventoryItem`. If
 *                    it returns `undefined`, that output is skipped.
 * @param opts        Optional skills, rng (for determinism), engine + entity.
 */
export function craft(
  recipe: Recipe,
  inventory: InventoryComponent,
  itemLookup: (id: string) => InventoryItem | undefined,
  opts?: {
    skills?: Record<string, number>;
    rng?: () => number;
    engine?: Engine;
    entity?: Partial<Entity>;
  },
): CraftResult {
  const rng = opts?.rng ?? Math.random;
  const engine = opts?.engine;
  const entity = opts?.entity;

  // 1) Gate on materials + skill.
  const gate = canCraft(recipe, inventory, opts?.skills);
  if (!gate.ok) {
    const result: CraftResult = {
      success: false,
      items: [],
      consumed: [],
      reason: gate.reason,
    };
    if (engine) {
      // `craft:failed` isn't in the global event-type map yet — cast so the
      // emit still type-checks. Event type will be added separately.
      (events.emit as any)("craft:failed", {
        entity,
        recipeId: recipe.id,
        reason: gate.reason,
        missing: gate.missing,
      });
    }
    return result;
  }

  // 2) Roll overall success. Failure still consumes ingredients ("recipe
  //    burned") but produces nothing.
  const successChance = recipe.successChance ?? 1;
  const succeeded = successChance >= 1 || rng() < successChance;

  // 3) Consume ingredients (skip tools — `consumed: false`).
  const consumed: Array<{ itemId: string; count: number }> = [];
  for (const ing of recipe.ingredients) {
    if (ing.consumed === false) continue;
    const removed = removeItem(inventory, ing.itemId, ing.count, engine, entity);
    if (removed > 0) {
      consumed.push({ itemId: ing.itemId, count: removed });
    }
  }

  if (!succeeded) {
    const result: CraftResult = {
      success: false,
      items: [],
      consumed,
      reason: "Craft failed",
    };
    if (engine) {
      (events.emit as any)("craft:failed", {
        entity,
        recipeId: recipe.id,
        reason: "Craft failed",
        consumed,
      });
    }
    return result;
  }

  // 4) Roll each output independently.
  const produced: InventoryItem[] = [];
  for (const out of recipe.outputs) {
    const chance = out.chance ?? 1;
    if (chance < 1 && rng() >= chance) continue;
    const item = itemLookup(out.itemId);
    if (!item) continue;
    const count = out.count ?? 1;
    if (count <= 0) continue;
    addItem(inventory, item, count, engine, entity);
    // Push one entry per output (so callers can see multiplicity), but we
    // don't duplicate the InventoryItem object — it's the same definition.
    produced.push(item);
  }

  // 5) Report the result.
  const result: CraftResult = {
    success: true,
    items: produced,
    consumed,
    xpGained: recipe.xp,
  };
  if (engine) {
    (events.emit as any)("craft:complete", {
      entity,
      recipeId: recipe.id,
      items: produced,
      consumed,
      xpGained: recipe.xp,
    });
  }
  return result;
}

// ── Recipe book ─────────────────────────────────────────────────

/**
 * Registry of recipes — the crafting equivalent of `QuestTracker` for
 * quests. Games register recipes once and look them up by id, category, or
 * output item. Purely a lookup aid; crafting logic lives in `craft()`.
 */
export class RecipeBook {
  private recipes = new Map<string, Recipe>();

  /** Register (or replace) a recipe. */
  register(recipe: Recipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  /** Remove a recipe by id. Returns `true` iff something was removed. */
  unregister(id: string): boolean {
    return this.recipes.delete(id);
  }

  /** Lookup a recipe by id. */
  get(id: string): Recipe | undefined {
    return this.recipes.get(id);
  }

  /** All registered recipes (insertion order). */
  all(): Recipe[] {
    return Array.from(this.recipes.values());
  }

  /** Recipes with a matching `category`. */
  byCategory(category: string): Recipe[] {
    const out: Recipe[] = [];
    for (const r of this.recipes.values()) {
      if (r.category === category) out.push(r);
    }
    return out;
  }

  /** Recipes whose outputs include `itemId`. */
  findByOutput(itemId: string): Recipe[] {
    const out: Recipe[] = [];
    for (const r of this.recipes.values()) {
      for (const o of r.outputs) {
        if (o.itemId === itemId) {
          out.push(r);
          break;
        }
      }
    }
    return out;
  }

  /** Recipes whose ingredients include `itemId` (useful for "what can I make with this?"). */
  findByIngredient(itemId: string): Recipe[] {
    const out: Recipe[] = [];
    for (const r of this.recipes.values()) {
      for (const ing of r.ingredients) {
        if (ing.itemId === itemId) {
          out.push(r);
          break;
        }
      }
    }
    return out;
  }

  /** Convenience — delegates to the pure `canCraft` helper. */
  canCraft(
    recipe: Recipe,
    inventory: InventoryComponent,
    skills?: Record<string, number>,
  ): CanCraftResult {
    return canCraft(recipe, inventory, skills);
  }

  /** Number of registered recipes. */
  get size(): number {
    return this.recipes.size;
  }

  /** Remove every registered recipe. */
  clear(): void {
    this.recipes.clear();
  }
}
