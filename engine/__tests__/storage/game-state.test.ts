import { describe, expect, test } from "bun:test";
import { AchievementTracker } from "../../behaviors/achievements";
import { createWallet, getBalance } from "../../behaviors/currency";
import { createEquipment, type EquippableItem, equipItem } from "../../behaviors/equipment";
import { addItem, countItem, createInventory, type InventoryItem } from "../../behaviors/inventory";
import { QuestTracker } from "../../behaviors/quests";
import { createStats, getStat } from "../../behaviors/stats";
import { rehydrateGameState, serializeGameState } from "../../storage/game-state";

const shortsword: EquippableItem = {
  id: "shortsword",
  name: "Shortsword",
  equipSlot: "weapon",
  modifiers: [{ stat: "attack", type: "flat", value: 5 }],
};

const potion: InventoryItem = {
  id: "potion",
  name: "Health Potion",
  stackable: true,
  maxStack: 10,
};

describe("serializeGameState / rehydrateGameState", () => {
  test("round-trips stats + equipment + inventory + wallet", () => {
    const stats = createStats({ attack: 3, gold: 0 });
    const equipment = createEquipment(["weapon"]);
    equipItem(equipment, shortsword, stats);
    const inventory = createInventory({ maxSlots: 10 });
    addItem(inventory, potion, 3);
    const wallet = createWallet({ gold: 250 });

    const data = serializeGameState({ stats, equipment, inventory, wallet });
    const json = JSON.parse(JSON.stringify(data));

    const restored = rehydrateGameState(json, {
      itemLookup: (id) =>
        (({ shortsword, potion }) as Record<string, InventoryItem | EquippableItem>)[id],
    });

    expect(getStat(restored.stats!, "attack")).toBe(8);
    expect(restored.equipment?.slots.weapon?.id).toBe("shortsword");
    expect(countItem(restored.inventory!, "potion")).toBe(3);
    expect(getBalance(restored.wallet!, "gold")).toBe(250);
  });

  test("skips missing snapshot fields", () => {
    const stats = createStats({ hp: 10 });
    const data = serializeGameState({ stats });
    expect(data.equipment).toBeUndefined();
    expect(data.inventory).toBeUndefined();
    expect(data.wallet).toBeUndefined();

    const restored = rehydrateGameState(data);
    expect(restored.stats).toBeDefined();
    expect(restored.equipment).toBeUndefined();
    expect(restored.inventory).toBeUndefined();
    expect(restored.wallet).toBeUndefined();
  });

  test("rehydrates quest + achievement trackers in place", () => {
    const quests = new QuestTracker();
    quests.register({
      id: "kill-rats",
      name: "Rat Hunter",
      description: "Slay some rats",
      objectives: [{ id: "kills", description: "Kill rats", target: 5 }],
    });
    quests.start("kill-rats");
    quests.progress("kill-rats", "kills", 2);

    const achievements = new AchievementTracker();
    achievements.register({
      id: "first-kill",
      name: "First Blood",
      description: "Defeat your first enemy",
      condition: { type: "event", eventName: "enemy:killed", count: 1 },
    });
    achievements.recordEvent("enemy:killed");

    const data = serializeGameState({ quests, achievements });

    const freshQuests = new QuestTracker();
    freshQuests.register({
      id: "kill-rats",
      name: "Rat Hunter",
      description: "Slay some rats",
      objectives: [{ id: "kills", description: "Kill rats", target: 5 }],
    });
    const freshAchievements = new AchievementTracker();
    freshAchievements.register({
      id: "first-kill",
      name: "First Blood",
      description: "Defeat your first enemy",
      condition: { type: "event", eventName: "enemy:killed", count: 1 },
    });

    rehydrateGameState(data, { quests: freshQuests, achievements: freshAchievements });
    expect(freshQuests.getState("kill-rats")?.objectives.kills.progress).toBe(2);
    expect(freshAchievements.getState("first-kill")?.unlocked).toBe(true);
  });

  test("unknown item ids survive load without crashing", () => {
    const inventory = createInventory();
    addItem(inventory, potion, 5);
    const data = serializeGameState({ inventory });

    const restored = rehydrateGameState(data, {
      itemLookup: () => undefined, // pretend registry forgot
    });
    expect(restored.inventory?.slots.length).toBe(0);
  });

  test("custom field round-trips unchanged", () => {
    const stats = createStats({ hp: 20 });
    const custom = {
      board: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      hand: ["card-a", "card-b"],
      mana: 7,
      nested: { foo: "bar", flags: { debug: true } },
    };

    const data = serializeGameState({ stats }, custom);
    expect(data.custom).toEqual(custom);

    const json = JSON.parse(JSON.stringify(data));
    const restored = rehydrateGameState(json);
    expect(restored.custom).toEqual(custom);
  });

  test("custom field omitted when not provided", () => {
    const stats = createStats({ hp: 10 });
    const data = serializeGameState({ stats });
    expect(data.custom).toBeUndefined();

    const restored = rehydrateGameState(data);
    expect(restored.custom).toBeUndefined();
  });
});
