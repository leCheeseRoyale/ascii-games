/**
 * Inventory behavior — reusable item management for any game.
 *
 * Provides a plain `InventoryComponent` that attaches to entities, plus
 * pure helper functions for adding, removing, stacking, and transferring
 * items. Items are plain objects so games can attach any data they need
 * (damage, heal amount, rarity, etc.) via the `[key: string]: any` escape.
 *
 * All helpers are pure and operate directly on the `InventoryComponent`.
 * Pass the optional `engine` + `entity` arguments to `addItem`,
 * `removeItem`, or `transferItem` to opt into event emission.
 *
 * @example
 * ```ts
 * import { createInventory, addItem, hasItem } from '@engine';
 *
 * const backpack = createInventory({ maxSlots: 20 });
 * const player = engine.spawn({
 *   position: { x: 0, y: 0 },
 *   inventory: backpack,
 * });
 *
 * const potion = { id: 'potion', name: 'Health Potion', icon: '!',
 *                  stackable: true, maxStack: 10, heal: 25 };
 * addItem(backpack, potion, 3, engine, player); // fires 'inventory:add'
 *
 * if (hasItem(backpack, 'potion')) { ... }
 * ```
 */

import { events } from "@shared/events";
import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";

// ── Public types ────────────────────────────────────────────────

/**
 * A single item definition. Only `id` and `name` are required; games can
 * attach any additional data via the index signature.
 */
export interface InventoryItem {
  /** Unique identifier — items stack only when their ids match. */
  id: string;
  /** Display name for UI. */
  name: string;
  /** Single char or short string for ASCII rendering. */
  icon?: string;
  /** Render color for the icon. */
  color?: string;
  /** Tooltip / flavor text. */
  description?: string;
  /** Whether multiple instances stack in a single slot. Default false. */
  stackable?: boolean;
  /** Max per slot when stackable. Default 99. */
  maxStack?: number;
  /** Optional weight used by `maxWeight` capacity systems. */
  weight?: number;
  /** Game-specific data (damage, heal, rarity, ...). */
  [key: string]: any;
}

/** A slot in an inventory — an item plus how many of it are stored. */
export interface InventorySlot {
  item: InventoryItem;
  count: number;
}

/** Attach this component to an entity to give it an inventory. */
export interface InventoryComponent {
  slots: InventorySlot[];
  /** Max number of distinct slots. `undefined` = unlimited. */
  maxSlots?: number;
  /** Max total weight across all slots. `undefined` = unlimited. */
  maxWeight?: number;
}

// ── Internal helpers ────────────────────────────────────────────

const DEFAULT_MAX_STACK = 99;

function maxStackOf(item: InventoryItem): number {
  if (!item.stackable) return 1;
  return item.maxStack ?? DEFAULT_MAX_STACK;
}

function weightOfItem(item: InventoryItem): number {
  return item.weight ?? 0;
}

/** Remaining capacity (in units) for the given inventory + item, in weight terms. */
function remainingWeightCapacity(inv: InventoryComponent, item: InventoryItem): number {
  if (inv.maxWeight === undefined) return Infinity;
  const per = weightOfItem(item);
  if (per <= 0) return Infinity;
  const remaining = inv.maxWeight - totalWeight(inv);
  if (remaining <= 0) return 0;
  return Math.floor(remaining / per);
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Create a new empty inventory component.
 *
 * @example
 * const inv = createInventory({ maxSlots: 20, maxWeight: 50 });
 */
export function createInventory(opts?: {
  maxSlots?: number;
  maxWeight?: number;
}): InventoryComponent {
  return {
    slots: [],
    maxSlots: opts?.maxSlots,
    maxWeight: opts?.maxWeight,
  };
}

// ── Queries ─────────────────────────────────────────────────────

/**
 * Get the total count of an item in the inventory (summed across slots).
 */
export function countItem(inv: InventoryComponent, itemId: string): number {
  let total = 0;
  for (const slot of inv.slots) {
    if (slot.item.id === itemId) total += slot.count;
  }
  return total;
}

/**
 * Check whether the inventory contains at least `count` of the given item.
 * @param count Minimum required count. Default 1.
 */
export function hasItem(inv: InventoryComponent, itemId: string, count = 1): boolean {
  return countItem(inv, itemId) >= count;
}

/** Total weight of all items in the inventory. */
export function totalWeight(inv: InventoryComponent): number {
  let total = 0;
  for (const slot of inv.slots) {
    total += weightOfItem(slot.item) * slot.count;
  }
  return total;
}

/**
 * Whether the inventory is considered full.
 *
 * Full means: all slots are used AND no existing stackable slot has room
 * for more of its own item, OR weight is at/over `maxWeight`.
 */
export function isFull(inv: InventoryComponent): boolean {
  if (inv.maxWeight !== undefined && totalWeight(inv) >= inv.maxWeight) return true;
  if (inv.maxSlots === undefined) return false;
  if (inv.slots.length < inv.maxSlots) return false;

  // All slot indices are occupied — full unless one of them can still stack.
  for (const slot of inv.slots) {
    if (slot.item.stackable && slot.count < maxStackOf(slot.item)) return false;
  }
  return true;
}

/** Get the slot at an index (for UI rendering). Returns undefined if out of range. */
export function getSlot(inv: InventoryComponent, index: number): InventorySlot | undefined {
  return inv.slots[index];
}

/** Find the index of the first slot containing `itemId`, or -1 if not found. */
export function findSlot(inv: InventoryComponent, itemId: string): number {
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i].item.id === itemId) return i;
  }
  return -1;
}

// ── Mutations ───────────────────────────────────────────────────

/**
 * Add `count` of `item` to the inventory.
 *
 * Prefers stacking into existing slots, then creates new slots as needed.
 * Returns `true` only if ALL `count` items were added. If partially or
 * fully blocked by capacity, returns `false` (and emits `inventory:full`
 * when an `engine` is supplied).
 *
 * Non-stackable items always occupy a fresh slot per unit.
 *
 * @param engine Optional — pass to enable event emission.
 * @param entity Optional — entity the inventory belongs to (included in events).
 */
export function addItem(
  inv: InventoryComponent,
  item: InventoryItem,
  count = 1,
  engine?: Engine,
  entity?: Partial<Entity>,
): boolean {
  if (count <= 0) return true;

  const weightCap = remainingWeightCapacity(inv, item);
  if (weightCap <= 0) {
    if (engine) events.emit("inventory:full", { entity, item });
    return false;
  }

  let remaining = Math.min(count, weightCap);
  const stackable = !!item.stackable;
  const maxPerSlot = maxStackOf(item);

  // 1) Top up existing stackable slots with matching id.
  if (stackable) {
    for (const slot of inv.slots) {
      if (remaining <= 0) break;
      if (slot.item.id !== item.id) continue;
      if (!slot.item.stackable) continue;
      const room = maxPerSlot - slot.count;
      if (room <= 0) continue;
      const add = Math.min(room, remaining);
      slot.count += add;
      remaining -= add;
    }
  }

  // 2) Create new slots for whatever is left, respecting maxSlots.
  while (remaining > 0) {
    if (inv.maxSlots !== undefined && inv.slots.length >= inv.maxSlots) break;
    const add = stackable ? Math.min(maxPerSlot, remaining) : 1;
    inv.slots.push({ item, count: add });
    remaining -= add;
  }

  const added = Math.min(count, weightCap) - remaining;
  const full = added < count;

  if (engine && added > 0) {
    events.emit("inventory:add", { entity, item, count: added });
  }
  if (engine && full) {
    events.emit("inventory:full", { entity, item });
  }

  return !full && added === count;
}

/**
 * Remove up to `count` of `itemId` from the inventory. Returns the actual
 * count removed (may be less than requested if the inventory ran out).
 *
 * Empties slots are dropped. Removal prefers the highest-count slot first.
 *
 * @param engine Optional — pass to enable event emission.
 * @param entity Optional — entity the inventory belongs to (included in events).
 */
export function removeItem(
  inv: InventoryComponent,
  itemId: string,
  count = 1,
  engine?: Engine,
  entity?: Partial<Entity>,
): number {
  if (count <= 0) return 0;

  let remaining = count;
  let removed = 0;

  // Sort candidate slots by count descending so we drain biggest stacks first.
  const candidates = inv.slots
    .map((slot, index) => ({ slot, index }))
    .filter((s) => s.slot.item.id === itemId)
    .sort((a, b) => b.slot.count - a.slot.count);

  for (const { slot } of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(slot.count, remaining);
    slot.count -= take;
    remaining -= take;
    removed += take;
  }

  // Prune emptied slots.
  if (removed > 0) {
    inv.slots = inv.slots.filter((s) => s.count > 0);
  }

  if (engine && removed > 0) {
    events.emit("inventory:remove", { entity, itemId, count: removed });
  }

  return removed;
}

/** Remove all items from the inventory (slot count and weight reset to 0). */
export function clearInventory(inv: InventoryComponent): void {
  inv.slots.length = 0;
}

/** JSON-safe snapshot produced by `serializeInventory`. */
export interface SerializedInventory {
  slots: Array<{ itemId: string; count: number }>;
  maxSlots?: number;
  maxWeight?: number;
}

/**
 * Serialize an `InventoryComponent` to a JSON-safe shape. Only item ids +
 * counts + caps are saved — item definitions are rehydrated from a game
 * registry via the lookup passed to `deserializeInventory`.
 */
export function serializeInventory(inv: InventoryComponent): SerializedInventory {
  return {
    slots: inv.slots.map((s) => ({ itemId: s.item.id, count: s.count })),
    maxSlots: inv.maxSlots,
    maxWeight: inv.maxWeight,
  };
}

/**
 * Rehydrate a previously serialized inventory. `itemLookup` turns an item id
 * into the full `InventoryItem` definition; unknown ids are skipped silently
 * so save files survive removed items.
 */
export function deserializeInventory(
  data: SerializedInventory,
  itemLookup: (id: string) => InventoryItem | undefined,
): InventoryComponent {
  const slots: InventorySlot[] = [];
  for (const entry of data?.slots ?? []) {
    const item = itemLookup(entry.itemId);
    if (item) slots.push({ item, count: entry.count });
  }
  return { slots, maxSlots: data?.maxSlots, maxWeight: data?.maxWeight };
}

/**
 * Move up to `count` of `itemId` from `from` into `to`. Returns the number
 * actually transferred. If `to` can't fit everything, the leftover stays in
 * `from` (items are not destroyed).
 *
 * Emits `inventory:remove` on the source and `inventory:add` on the
 * destination when an `engine` is supplied.
 */
export function transferItem(
  from: InventoryComponent,
  to: InventoryComponent,
  itemId: string,
  count = 1,
  engine?: Engine,
  fromEntity?: Partial<Entity>,
  toEntity?: Partial<Entity>,
): number {
  if (count <= 0) return 0;

  const available = Math.min(count, countItem(from, itemId));
  if (available <= 0) return 0;

  // We need the actual item definition to insert into `to`. Grab it from
  // the first matching slot in `from`.
  const sourceIndex = findSlot(from, itemId);
  if (sourceIndex < 0) return 0;
  const item = from.slots[sourceIndex].item;

  // Figure out how much `to` can actually accept, so we never destroy items.
  const accepted = _simulateAdd(to, item, available);
  if (accepted <= 0) {
    if (engine) events.emit("inventory:full", { entity: toEntity, item });
    return 0;
  }

  // Perform the real moves.
  removeItem(from, itemId, accepted, engine, fromEntity);
  addItem(to, item, accepted, engine, toEntity);
  return accepted;
}

// ── Internal: non-destructive capacity check ────────────────────

/**
 * Compute how many of `item` could be accepted by `inv` without actually
 * modifying it. Mirrors the logic in `addItem`.
 */
function _simulateAdd(inv: InventoryComponent, item: InventoryItem, count: number): number {
  if (count <= 0) return 0;

  const weightCap = remainingWeightCapacity(inv, item);
  if (weightCap <= 0) return 0;

  let remaining = Math.min(count, weightCap);
  const stackable = !!item.stackable;
  const maxPerSlot = maxStackOf(item);

  // Top-up existing stackable slots.
  if (stackable) {
    for (const slot of inv.slots) {
      if (remaining <= 0) break;
      if (slot.item.id !== item.id) continue;
      if (!slot.item.stackable) continue;
      const room = maxPerSlot - slot.count;
      if (room <= 0) continue;
      const add = Math.min(room, remaining);
      remaining -= add;
    }
  }

  // New slots.
  let usedSlots = inv.slots.length;
  while (remaining > 0) {
    if (inv.maxSlots !== undefined && usedSlots >= inv.maxSlots) break;
    const add = stackable ? Math.min(maxPerSlot, remaining) : 1;
    usedSlots++;
    remaining -= add;
  }

  return Math.min(count, weightCap) - remaining;
}
