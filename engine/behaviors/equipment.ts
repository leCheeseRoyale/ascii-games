/**
 * Equipment behavior — slot-based gear that binds inventory items to stat bonuses.
 *
 * An `EquipmentComponent` owns a fixed set of named slots (`"weapon"`,
 * `"head"`, `"ring1"`, ...). Each slot either holds an `EquippableItem`
 * (which extends `InventoryItem`) or is empty. Equipping an item:
 *
 *   1. Validates the slot exists and (optional) `requirements` are met
 *      against a `Stats` bag.
 *   2. Displaces any existing item in the target slot, plus anything that
 *      was being blocked by the new/old items (two-handed weapons block
 *      the offhand slot, for example).
 *   3. Applies the item's `modifiers` to the provided `Stats` under the
 *      source tag `equipment:<slotId>` so they can be cleanly removed on
 *      unequip via `removeModifiersBySource`.
 *
 * The helpers are pure and mutate the component + stats in place. Pass the
 * optional `engine` + `entity` arguments to `equipItem` / `unequipItem` /
 * `clearEquipment` to opt into event emission — identical pattern to
 * `inventory.ts`.
 *
 * @example
 * ```ts
 * import {
 *   createEquipment, equipItem, unequipItem,
 *   createStats, getStat,
 * } from '@engine';
 *
 * const stats = createStats({ strength: 10, attack: 5 });
 * const equipment = createEquipment(
 *   ['weapon', 'offhand', 'head', 'chest'],
 *   { weapon: ['offhand'] }, // two-handed weapons block offhand
 * );
 *
 * const greatsword = {
 *   id: 'greatsword', name: 'Greatsword', icon: '/',
 *   equipSlot: 'weapon',
 *   twoHanded: true,
 *   modifiers: [{ stat: 'attack', type: 'flat', value: 15 }],
 *   requirements: { strength: 10 },
 * };
 *
 * equipItem(equipment, greatsword, stats);
 * getStat(stats, 'attack'); // 5 + 15 = 20
 * ```
 */

import { events } from "@shared/events";
import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import type { InventoryItem } from "./inventory";
import {
  addModifier,
  getStat,
  removeModifiersBySource,
  type StatModifier,
  type Stats,
} from "./stats";

// ── Public types ────────────────────────────────────────────────

/** Slot identifier — games define their own (`"weapon"`, `"head"`, `"ring1"`, ...). */
export type EquipmentSlotId = string;

/**
 * An inventory item that can be equipped. Extends `InventoryItem` with slot
 * metadata plus optional stat modifiers and requirements.
 */
export interface EquippableItem extends InventoryItem {
  /** Which slot this item occupies. */
  equipSlot: EquipmentSlotId;
  /** When true and equipped to `"weapon"`, also blocks `"offhand"`. */
  twoHanded?: boolean;
  /**
   * Stat modifiers to apply while equipped. `id` and `source` are
   * assigned by `equipItem` so they don't collide across slots.
   */
  modifiers?: Array<Omit<StatModifier, "id" | "source">>;
  /**
   * Minimum stat values required to equip. `canEquip` checks each key
   * via `getStat(stats, key) >= value`.
   */
  requirements?: Record<string, number>;
}

/** Attach this component to an entity to give it equipment slots. */
export interface EquipmentComponent {
  /** Map of `slotId` → equipped item (or `null` when empty). */
  slots: Record<EquipmentSlotId, EquippableItem | null>;
  /**
   * For each slot, which OTHER slots it blocks when filled. Typically used
   * for two-handed weapons: `{ weapon: ['offhand'] }`.
   * A blocked slot cannot hold anything while its blocker is occupied by
   * a `twoHanded` item.
   */
  blocks?: Record<EquipmentSlotId, EquipmentSlotId[]>;
}

/** JSON-safe snapshot produced by `serializeEquipment`. */
export interface SerializedEquipment {
  slots: Record<EquipmentSlotId, string | null>;
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Create a new empty `EquipmentComponent` with the given slot ids.
 *
 * @param slotIds Every slot the entity can have. Slots not listed here are
 *                rejected by `equipItem`.
 * @param blocks  Optional blocking map — e.g., `{ weapon: ['offhand'] }`
 *                makes two-handed weapons block the offhand slot.
 */
export function createEquipment(
  slotIds: EquipmentSlotId[],
  blocks?: Record<EquipmentSlotId, EquipmentSlotId[]>,
): EquipmentComponent {
  const slots: Record<EquipmentSlotId, EquippableItem | null> = {};
  for (const id of slotIds) slots[id] = null;
  return {
    slots,
    blocks: blocks ? { ...blocks } : undefined,
  };
}

// ── Internal helpers ────────────────────────────────────────────

/**
 * Slots blocked by `slotId` when its current/prospective item is two-handed.
 * Returns a fresh array (possibly empty).
 */
function blockedBy(equipment: EquipmentComponent, slotId: EquipmentSlotId): EquipmentSlotId[] {
  const list = equipment.blocks?.[slotId];
  return list ?? [];
}

/**
 * Apply all modifiers of `item` to `stats` under the per-slot source tag.
 * No-op if either side is missing.
 */
function applyModifiers(
  stats: Stats | undefined,
  item: EquippableItem,
  slotId: EquipmentSlotId,
): void {
  if (!stats || !item.modifiers) return;
  const source = `equipment:${slotId}`;
  item.modifiers.forEach((mod, i) => {
    addModifier(stats, {
      ...mod,
      id: `equip:${slotId}:${i}`,
      source,
    });
  });
}

/** Remove every modifier associated with `slotId`. No-op if `stats` missing. */
function clearSlotModifiers(stats: Stats | undefined, slotId: EquipmentSlotId): void {
  if (!stats) return;
  removeModifiersBySource(stats, `equipment:${slotId}`);
}

// ── Queries ─────────────────────────────────────────────────────

/** The item currently in `slotId`, or `null` when empty or unknown. */
export function getEquipped(
  equipment: EquipmentComponent,
  slotId: EquipmentSlotId,
): EquippableItem | null {
  const slot = equipment.slots[slotId];
  return slot ?? null;
}

/**
 * Whether `slotId` exists and is currently empty. Returns `false` for
 * unknown slots as well.
 */
export function isSlotAvailable(equipment: EquipmentComponent, slotId: EquipmentSlotId): boolean {
  if (!(slotId in equipment.slots)) return false;
  return equipment.slots[slotId] === null;
}

/**
 * Check whether `item` could be equipped right now.
 *
 * Failure reasons (first match wins):
 *  - Item targets a slot this component doesn't have.
 *  - A required stat is below the item's minimum.
 *
 * Existing items in the target slot are NOT a failure — `equipItem`
 * handles displacement automatically.
 */
export function canEquip(
  equipment: EquipmentComponent,
  item: EquippableItem,
  stats?: Stats,
): { ok: boolean; reason?: string } {
  if (!(item.equipSlot in equipment.slots)) {
    return { ok: false, reason: `No ${item.equipSlot} slot available` };
  }

  if (item.requirements && stats) {
    for (const [stat, min] of Object.entries(item.requirements)) {
      const current = getStat(stats, stat);
      if (current < min) {
        return { ok: false, reason: `Requires ${stat} ${min}` };
      }
    }
  }

  return { ok: true };
}

// ── Mutations ───────────────────────────────────────────────────

/**
 * Equip `item` into its `equipSlot`. Any existing item in the target slot
 * (or in a slot blocked by a two-handed weapon) is returned to the caller
 * as a "displaced" item so it can be re-added to inventory.
 *
 * Behavior:
 *  - If the target slot is unknown or requirements fail, returns `[]` and
 *    leaves everything untouched.
 *  - Any item already in the target slot has its modifiers removed and is
 *    added to the returned array.
 *  - If `item.twoHanded`, every slot listed in `blocks[equipSlot]` is also
 *    emptied; occupants are displaced and their modifiers removed.
 *  - New modifiers are applied under `equipment:<slotId>` so they can be
 *    removed cleanly later via `removeModifiersBySource`.
 *  - Emits `equipment:equip` when `engine` is provided.
 *
 * @returns Displaced items (in order: previous slot occupant first, then
 *          blocked-slot occupants). Empty if nothing was displaced or the
 *          equip was rejected.
 */
export function equipItem(
  equipment: EquipmentComponent,
  item: EquippableItem,
  stats?: Stats,
  engine?: Engine,
  entity?: Partial<Entity>,
): EquippableItem[] {
  const check = canEquip(equipment, item, stats);
  if (!check.ok) return [];

  const slotId = item.equipSlot;
  const displaced: EquippableItem[] = [];

  // Unequip the item currently in the target slot (if any).
  const existing = equipment.slots[slotId];
  if (existing) {
    clearSlotModifiers(stats, slotId);
    equipment.slots[slotId] = null;
    displaced.push(existing);
    if (engine) {
      events.emit("equipment:unequip", {
        entity,
        item: existing,
        slotId,
      });
    }
  }

  // If the incoming item is two-handed, clear any slots it blocks.
  if (item.twoHanded) {
    for (const blockedId of blockedBy(equipment, slotId)) {
      if (!(blockedId in equipment.slots)) continue;
      const blocker = equipment.slots[blockedId];
      if (blocker) {
        clearSlotModifiers(stats, blockedId);
        equipment.slots[blockedId] = null;
        displaced.push(blocker);
        if (engine) {
          events.emit("equipment:unequip", {
            entity,
            item: blocker,
            slotId: blockedId,
          });
        }
      }
    }
  }

  // Apply the new item.
  equipment.slots[slotId] = item;
  applyModifiers(stats, item, slotId);

  if (engine) {
    events.emit("equipment:equip", {
      entity,
      item,
      slotId,
    });
  }

  return displaced;
}

/**
 * Unequip whatever is in `slotId`. Returns the removed item (or `null` if
 * the slot was already empty or unknown). Clears the item's stat modifiers
 * and emits `equipment:unequip` when `engine` is supplied.
 */
export function unequipItem(
  equipment: EquipmentComponent,
  slotId: EquipmentSlotId,
  stats?: Stats,
  engine?: Engine,
  entity?: Partial<Entity>,
): EquippableItem | null {
  if (!(slotId in equipment.slots)) return null;
  const item = equipment.slots[slotId];
  if (!item) return null;

  clearSlotModifiers(stats, slotId);
  equipment.slots[slotId] = null;

  if (engine) {
    events.emit("equipment:unequip", {
      entity,
      item,
      slotId,
    });
  }

  return item;
}

/**
 * Remove every equipped item. Returns them in slot-iteration order (same
 * order `Object.keys(equipment.slots)` yields). Stats are cleaned up the
 * same way as individual unequips.
 */
export function clearEquipment(
  equipment: EquipmentComponent,
  stats?: Stats,
  engine?: Engine,
  entity?: Partial<Entity>,
): EquippableItem[] {
  const removed: EquippableItem[] = [];
  for (const slotId of Object.keys(equipment.slots)) {
    const item = equipment.slots[slotId];
    if (!item) continue;
    clearSlotModifiers(stats, slotId);
    equipment.slots[slotId] = null;
    removed.push(item);
    if (engine) {
      events.emit("equipment:unequip", {
        entity,
        item,
        slotId,
      });
    }
  }
  return removed;
}

// ── Persistence ─────────────────────────────────────────────────

/**
 * Serialize an `EquipmentComponent` to a JSON-safe shape that records only
 * item ids per slot. Games are expected to rehydrate item definitions from
 * their own registry via the lookup passed to `deserializeEquipment`.
 */
export function serializeEquipment(equipment: EquipmentComponent): SerializedEquipment {
  const slots: Record<EquipmentSlotId, string | null> = {};
  for (const slotId of Object.keys(equipment.slots)) {
    const item = equipment.slots[slotId];
    slots[slotId] = item ? item.id : null;
  }
  return { slots };
}

/**
 * Rehydrate a previously serialized equipment snapshot. `itemLookup` turns
 * an item id into the full `EquippableItem` definition; if it returns
 * `undefined`, that slot stays empty.
 *
 * Pass `stats` to re-apply each equipped item's modifiers under the same
 * `equipment:<slotId>` source tags `equipItem` uses — this restores buff
 * state after load so equipped gear actually grants its bonuses again.
 * Omit it if you also persist `Stats` separately via `serializeStats` and
 * don't want the modifiers double-counted.
 *
 * `blocks` is not part of the snapshot (it's static slot configuration,
 * not state) — pass the same map you used in `createEquipment` if your
 * game relies on two-handed blocking after load.
 */
export function deserializeEquipment(
  data: SerializedEquipment,
  itemLookup: (id: string) => EquippableItem | undefined,
  stats?: Stats,
  blocks?: Record<EquipmentSlotId, EquipmentSlotId[]>,
): EquipmentComponent {
  const slots: Record<EquipmentSlotId, EquippableItem | null> = {};
  const source = data?.slots ?? {};
  for (const slotId of Object.keys(source)) {
    const itemId = source[slotId];
    if (!itemId) {
      slots[slotId] = null;
      continue;
    }
    const item = itemLookup(itemId);
    slots[slotId] = item ?? null;
    if (item && stats) applyModifiers(stats, item, slotId);
  }
  return { slots, blocks: blocks ? { ...blocks } : undefined };
}
