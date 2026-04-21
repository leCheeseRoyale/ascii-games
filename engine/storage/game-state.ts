/**
 * Unified snapshot of the per-player state that most games want to persist
 * together: `Stats`, equipment, inventory, currency wallet, quest tracker,
 * and achievement tracker. Any field can be omitted — the helpers skip
 * missing pieces so games only serialize what they actually use.
 *
 * Typical usage:
 *
 * ```ts
 * import {
 *   serializeGameState, rehydrateGameState, save, load,
 * } from '@engine';
 *
 * // Save at a checkpoint
 * const snapshot = serializeGameState({
 *   stats: player.stats,
 *   equipment: player.equipment,
 *   inventory: player.inventory,
 *   wallet: player.wallet,
 *   quests, achievements,
 * });
 * save('checkpoint', snapshot);
 *
 * // Restore on load
 * const data = load<SerializedGameState>('checkpoint');
 * if (data) {
 *   const state = rehydrateGameState(data, {
 *     itemLookup: (id) => items[id],
 *     equipmentBlocks: { weapon: ['offhand'] },
 *     achievements,
 *     quests,
 *   });
 *   player.stats = state.stats ?? player.stats;
 *   player.inventory = state.inventory ?? player.inventory;
 *   // ...
 * }
 * ```
 */

import type { AchievementState, AchievementTracker } from "../behaviors/achievements";
import type { CurrencyWallet, SerializedWallet } from "../behaviors/currency";
import { deserializeWallet, serializeWallet } from "../behaviors/currency";
import {
  deserializeEquipment,
  type EquipmentComponent,
  type EquipmentSlotId,
  type EquippableItem,
  type SerializedEquipment,
  serializeEquipment,
} from "../behaviors/equipment";
import {
  deserializeInventory,
  type InventoryComponent,
  type InventoryItem,
  type SerializedInventory,
  serializeInventory,
} from "../behaviors/inventory";
import type { QuestState, QuestTracker } from "../behaviors/quests";
import { deserializeStats, type Stats, serializeStats } from "../behaviors/stats";

export interface SerializedGameState {
  stats?: Record<string, unknown>;
  equipment?: SerializedEquipment;
  inventory?: SerializedInventory;
  wallet?: SerializedWallet;
  quests?: Record<string, unknown>;
  achievements?: Record<string, unknown>;
  /**
   * Opaque per-game data — the engine never reads it. Use this to bundle
   * game-specific state (board layout, deck, hero HP, etc.) into the same
   * snapshot so your migration hook and save slots cover it automatically.
   */
  custom?: Record<string, unknown>;
}

export interface GameStateSources {
  stats?: Stats;
  equipment?: EquipmentComponent;
  inventory?: InventoryComponent;
  wallet?: CurrencyWallet;
  quests?: QuestTracker;
  achievements?: AchievementTracker;
}

export interface RehydrateOptions {
  /**
   * Item registry lookup — required if `inventory` or `equipment` were
   * serialized. Unknown ids are skipped silently so save files survive
   * removed items.
   */
  itemLookup?: (id: string) => InventoryItem | EquippableItem | undefined;
  /** Pass your static two-handed blocking map to restore it after load. */
  equipmentBlocks?: Record<EquipmentSlotId, EquipmentSlotId[]>;
  /**
   * Existing trackers to rehydrate in place. Quest/Achievement trackers own
   * their event handlers, so we mutate the instance the game already uses.
   */
  quests?: QuestTracker;
  achievements?: AchievementTracker;
}

export interface RehydratedGameState {
  stats?: Stats;
  equipment?: EquipmentComponent;
  inventory?: InventoryComponent;
  wallet?: CurrencyWallet;
  /** Pass-through of `SerializedGameState.custom` — opaque to the engine. */
  custom?: Record<string, unknown>;
}

/**
 * Snapshot whichever pieces the caller passes in. Missing fields are left
 * off the output so the saved JSON stays minimal. Stats modifiers are saved
 * alongside base stats so equipment bonuses round-trip correctly when you
 * pair this with `deserializeEquipment(..., stats)`.
 *
 * `custom` is an opaque per-game blob that rides along unchanged — the
 * engine never validates or mutates it. Use it for game-specific state
 * (card-game board, puzzle grid, dialog flags) that doesn't map to the
 * built-in subsystems.
 */
export function serializeGameState(
  sources: GameStateSources,
  custom?: Record<string, unknown>,
): SerializedGameState {
  const out: SerializedGameState = {};
  if (sources.stats) out.stats = serializeStats(sources.stats);
  if (sources.equipment) out.equipment = serializeEquipment(sources.equipment);
  if (sources.inventory) out.inventory = serializeInventory(sources.inventory);
  if (sources.wallet) out.wallet = serializeWallet(sources.wallet);
  if (sources.quests) out.quests = sources.quests.serialize();
  if (sources.achievements) out.achievements = sources.achievements.serialize();
  if (custom) out.custom = custom;
  return out;
}

/**
 * Rebuild components from a snapshot. Stats modifiers are restored from the
 * serialized stats payload; equipment is deserialized *without* reapplying
 * modifiers (they already live on the restored stats). If the caller stored
 * only equipment (no stats), pass `stats` separately to `deserializeEquipment`
 * instead of using this helper.
 *
 * Quest and achievement trackers are rehydrated in place when provided so
 * their event listeners are preserved.
 */
export function rehydrateGameState(
  data: SerializedGameState,
  opts: RehydrateOptions = {},
): RehydratedGameState {
  const out: RehydratedGameState = {};

  if (data.stats) out.stats = deserializeStats(data.stats);

  if (data.equipment) {
    out.equipment = deserializeEquipment(
      data.equipment,
      (id) => opts.itemLookup?.(id) as EquippableItem | undefined,
      undefined, // modifiers already live on the restored stats above
      opts.equipmentBlocks,
    );
  }

  if (data.inventory) {
    out.inventory = deserializeInventory(
      data.inventory,
      (id) => opts.itemLookup?.(id) as InventoryItem | undefined,
    );
  }

  if (data.wallet) out.wallet = deserializeWallet(data.wallet);

  if (data.quests && opts.quests)
    opts.quests.deserialize(data.quests as Record<string, QuestState>);
  if (data.achievements && opts.achievements)
    opts.achievements.deserialize(data.achievements as Record<string, AchievementState>);

  if (data.custom) out.custom = data.custom;

  return out;
}
