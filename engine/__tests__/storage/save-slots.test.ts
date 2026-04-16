import { beforeEach, describe, expect, test } from "bun:test";
import { type SaveSlot, SaveSlotManager } from "../../storage/save-slots";
import { setStoragePrefix } from "../../storage/storage";

// ── Fixtures ────────────────────────────────────────────────────

interface GameState {
  level: number;
  hp: number;
  inventory: string[];
}

const baseState: GameState = {
  level: 1,
  hp: 100,
  inventory: ["sword"],
};

function makeManager(opts?: ConstructorParameters<typeof SaveSlotManager<GameState>>[0]) {
  return new SaveSlotManager<GameState>(opts);
}

// Reset storage prefix before every test so tests don't interfere with each
// other via leftover prefix configuration from previous test files. The
// global beforeEach in setup.ts already clears the localStorage map.
beforeEach(() => {
  localStorage.clear();
  setStoragePrefix("ascii-game");
});

// ── Constructor ─────────────────────────────────────────────────

describe("constructor defaults", () => {
  test("creates a manager with default options", () => {
    const m = makeManager();
    expect(m).toBeInstanceOf(SaveSlotManager);
    expect(m.count()).toBe(0);
    expect(m.getActive()).toBeNull();
    expect(m.hasAutosave()).toBe(false);
  });

  test("accepts custom maxSlots and prefix", () => {
    const m = makeManager({ maxSlots: 3, prefix: "my:" });
    m.save("a", baseState);
    expect(m.count()).toBe(1);
    expect(m.exists("a")).toBe(true);
  });

  test("supports Infinity maxSlots", () => {
    const m = makeManager({ maxSlots: Infinity });
    for (let i = 0; i < 20; i++) {
      m.save(`slot-${i}`, baseState);
    }
    expect(m.count()).toBe(20);
    expect(m.isFull()).toBe(false);
  });
});

// ── save ────────────────────────────────────────────────────────

describe("save()", () => {
  test("creates a new slot with default metadata", () => {
    const m = makeManager();
    const meta = m.save("slot-1", baseState);
    expect(meta.slotId).toBe("slot-1");
    expect(meta.name).toBe("Slot 1");
    expect(typeof meta.timestamp).toBe("number");
    expect(meta.playtime).toBe(0);
    expect(m.count()).toBe(1);
  });

  test("default name increments with slot count", () => {
    const m = makeManager();
    const first = m.save("a", baseState);
    const second = m.save("b", baseState);
    expect(first.name).toBe("Slot 1");
    expect(second.name).toBe("Slot 2");
  });

  test("merges user-provided metadata", () => {
    const m = makeManager();
    const meta = m.save("slot-1", baseState, {
      name: "My Save",
      sceneName: "forest",
      playtime: 1234,
      custom: { score: 9000 },
    });
    expect(meta.name).toBe("My Save");
    expect(meta.sceneName).toBe("forest");
    expect(meta.playtime).toBe(1234);
    expect(meta.custom).toEqual({ score: 9000 });
  });

  test("overwrites an existing slot without changing count", () => {
    const m = makeManager();
    m.save("slot-1", baseState, { name: "Original" });
    const again = m.save("slot-1", { ...baseState, level: 2 }, { name: "Updated" });
    expect(again.name).toBe("Updated");
    expect(m.count()).toBe(1);
    const loaded = m.load("slot-1");
    expect(loaded?.data.level).toBe(2);
  });

  test("throws when maxSlots reached and slotId is new", () => {
    const m = makeManager({ maxSlots: 2 });
    m.save("a", baseState);
    m.save("b", baseState);
    expect(() => m.save("c", baseState)).toThrow(/maxSlots/);
  });

  test("allows overwriting existing slots even when full", () => {
    const m = makeManager({ maxSlots: 2 });
    m.save("a", baseState);
    m.save("b", baseState);
    // Overwriting 'a' is fine.
    expect(() => m.save("a", baseState)).not.toThrow();
  });

  test("throws on empty slotId", () => {
    const m = makeManager();
    expect(() => m.save("", baseState)).toThrow();
  });

  test("attaches configured version when caller doesn't specify one", () => {
    const m = makeManager({ version: "2.0.0" });
    const meta = m.save("slot-1", baseState);
    expect(meta.version).toBe("2.0.0");
  });

  test("caller-supplied version overrides manager version", () => {
    const m = makeManager({ version: "2.0.0" });
    const meta = m.save("slot-1", baseState, { version: "1.0.0" });
    expect(meta.version).toBe("1.0.0");
  });
});

// ── load ────────────────────────────────────────────────────────

describe("load()", () => {
  test("returns the saved slot", () => {
    const m = makeManager();
    m.save("slot-1", baseState, { name: "Hero" });
    const slot = m.load("slot-1");
    expect(slot).not.toBeNull();
    expect(slot?.metadata.name).toBe("Hero");
    expect(slot?.data).toEqual(baseState);
  });

  test("returns null when the slot is missing", () => {
    const m = makeManager();
    expect(m.load("nope")).toBeNull();
  });

  test("preserves custom metadata fields", () => {
    const m = makeManager();
    m.save("slot-1", baseState, {
      custom: { score: 500, chapter: "The Ruins", flags: [1, 2, 3] },
    });
    const slot = m.load("slot-1");
    expect(slot?.metadata.custom).toEqual({ score: 500, chapter: "The Ruins", flags: [1, 2, 3] });
  });

  test("preserves thumbnail", () => {
    const thumb = "data:image/png;base64,iVBORw0KGgo=";
    const m = makeManager();
    m.save("slot-1", baseState, { thumbnail: thumb });
    const slot = m.load("slot-1");
    expect(slot?.metadata.thumbnail).toBe(thumb);
  });
});

// ── delete ──────────────────────────────────────────────────────

describe("delete()", () => {
  test("returns true for an existing slot and removes it", () => {
    const m = makeManager();
    m.save("slot-1", baseState);
    expect(m.delete("slot-1")).toBe(true);
    expect(m.exists("slot-1")).toBe(false);
    expect(m.count()).toBe(0);
  });

  test("returns false for a missing slot", () => {
    const m = makeManager();
    expect(m.delete("nope")).toBe(false);
  });

  test("clears active slot when the active slot is deleted", () => {
    const m = makeManager();
    m.save("slot-1", baseState);
    m.setActive("slot-1");
    expect(m.getActive()).toBe("slot-1");
    m.delete("slot-1");
    expect(m.getActive()).toBeNull();
  });

  test("leaves active alone when a different slot is deleted", () => {
    const m = makeManager();
    m.save("a", baseState);
    m.save("b", baseState);
    m.setActive("a");
    m.delete("b");
    expect(m.getActive()).toBe("a");
  });
});

// ── exists ──────────────────────────────────────────────────────

describe("exists()", () => {
  test("true after save, false after delete", () => {
    const m = makeManager();
    expect(m.exists("x")).toBe(false);
    m.save("x", baseState);
    expect(m.exists("x")).toBe(true);
    m.delete("x");
    expect(m.exists("x")).toBe(false);
  });
});

// ── rename ──────────────────────────────────────────────────────

describe("rename()", () => {
  test("renames and persists", () => {
    const m = makeManager();
    m.save("slot-1", baseState, { name: "Original" });
    expect(m.rename("slot-1", "Renamed")).toBe(true);
    expect(m.load("slot-1")?.metadata.name).toBe("Renamed");
  });

  test("returns false for missing slot", () => {
    const m = makeManager();
    expect(m.rename("nope", "X")).toBe(false);
  });
});

// ── list / count / isFull / clear ───────────────────────────────

describe("list()", () => {
  test("returns metadata sorted by timestamp descending", async () => {
    const m = makeManager();
    m.save("a", baseState, { name: "A" });
    // Ensure distinct timestamps by yielding briefly.
    await new Promise((r) => setTimeout(r, 2));
    m.save("b", baseState, { name: "B" });
    await new Promise((r) => setTimeout(r, 2));
    m.save("c", baseState, { name: "C" });

    const list = m.list();
    expect(list.map((s) => s.name)).toEqual(["C", "B", "A"]);
  });

  test("excludes autosave from the list", () => {
    const m = makeManager();
    m.save("slot-1", baseState);
    m.autosave(baseState);
    const list = m.list();
    expect(list.some((s) => s.slotId === "autosave")).toBe(false);
    expect(list.length).toBe(1);
  });

  test("returns an empty array when no slots exist", () => {
    const m = makeManager();
    expect(m.list()).toEqual([]);
  });

  test("prunes slots whose data was removed out-of-band", () => {
    const m = makeManager();
    m.save("a", baseState);
    m.save("b", baseState);
    // Simulate an out-of-band deletion: wipe the slot data but leave the index.
    localStorage.removeItem("ascii-game:save:a");
    const list = m.list();
    expect(list.map((s) => s.slotId)).toEqual(["b"]);
    // And the index should have been pruned.
    expect(m.count()).toBe(1);
  });
});

describe("count()", () => {
  test("tracks saves and deletes, ignores autosave", () => {
    const m = makeManager();
    expect(m.count()).toBe(0);
    m.save("a", baseState);
    m.save("b", baseState);
    m.autosave(baseState);
    expect(m.count()).toBe(2);
    m.delete("a");
    expect(m.count()).toBe(1);
  });
});

describe("isFull()", () => {
  test("true when count reaches maxSlots", () => {
    const m = makeManager({ maxSlots: 2 });
    expect(m.isFull()).toBe(false);
    m.save("a", baseState);
    expect(m.isFull()).toBe(false);
    m.save("b", baseState);
    expect(m.isFull()).toBe(true);
  });

  test("autosave does not affect isFull", () => {
    const m = makeManager({ maxSlots: 1 });
    m.autosave(baseState);
    expect(m.isFull()).toBe(false);
  });
});

describe("clear()", () => {
  test("removes every slot, autosave, and active tracker", () => {
    const m = makeManager();
    m.save("a", baseState);
    m.save("b", baseState);
    m.autosave(baseState);
    m.setActive("a");

    m.clear();

    expect(m.count()).toBe(0);
    expect(m.exists("a")).toBe(false);
    expect(m.exists("b")).toBe(false);
    expect(m.hasAutosave()).toBe(false);
    expect(m.getActive()).toBeNull();
  });
});

// ── Active slot ─────────────────────────────────────────────────

describe("active slot tracking", () => {
  test("setActive / getActive round trip", () => {
    const m = makeManager();
    expect(m.getActive()).toBeNull();
    m.setActive("slot-1");
    expect(m.getActive()).toBe("slot-1");
    m.setActive(null);
    expect(m.getActive()).toBeNull();
  });

  test("saveActive writes to the active slot", () => {
    const m = makeManager();
    m.save("slot-1", baseState);
    m.setActive("slot-1");
    const meta = m.saveActive({ ...baseState, level: 5 }, { name: "Boss" });
    expect(meta).not.toBeNull();
    expect(meta?.name).toBe("Boss");
    expect(m.load("slot-1")?.data.level).toBe(5);
  });

  test("saveActive returns null when no active slot", () => {
    const m = makeManager();
    expect(m.saveActive(baseState)).toBeNull();
  });

  test("loadActive loads the active slot", () => {
    const m = makeManager();
    m.save("slot-1", baseState, { name: "Hero" });
    m.setActive("slot-1");
    const slot = m.loadActive();
    expect(slot?.metadata.name).toBe("Hero");
  });

  test("loadActive returns null when no active slot", () => {
    const m = makeManager();
    expect(m.loadActive()).toBeNull();
  });
});

// ── Autosave ────────────────────────────────────────────────────

describe("autosave", () => {
  test("autosave saves / loads / hasAutosave reflects state", () => {
    const m = makeManager();
    expect(m.hasAutosave()).toBe(false);
    const meta = m.autosave(baseState, { sceneName: "dungeon" });
    expect(meta.slotId).toBe("autosave");
    expect(meta.name).toBe("Autosave");
    expect(m.hasAutosave()).toBe(true);
    const loaded = m.loadAutosave();
    expect(loaded?.data).toEqual(baseState);
    expect(loaded?.metadata.sceneName).toBe("dungeon");
  });

  test("autosave does not count toward maxSlots", () => {
    const m = makeManager({ maxSlots: 1 });
    m.save("a", baseState);
    expect(m.isFull()).toBe(true);
    // Autosave should succeed even when full.
    expect(() => m.autosave(baseState)).not.toThrow();
    expect(m.hasAutosave()).toBe(true);
    expect(m.count()).toBe(1);
  });

  test("loadAutosave returns null when no autosave exists", () => {
    const m = makeManager();
    expect(m.loadAutosave()).toBeNull();
  });

  test("autosave custom name overrides default", () => {
    const m = makeManager();
    const meta = m.autosave(baseState, { name: "Quick Save" });
    expect(meta.name).toBe("Quick Save");
  });
});

// ── Export / import ─────────────────────────────────────────────

describe("exportSlot / importSlot", () => {
  test("round-trips a slot via JSON", () => {
    const a = makeManager();
    a.save("slot-1", baseState, { name: "Exported", playtime: 42, sceneName: "cave" });
    const json = a.exportSlot("slot-1");
    expect(typeof json).toBe("string");

    const b = makeManager();
    expect(b.importSlot("imported", json!)).toBe(true);

    const loaded = b.load("imported");
    expect(loaded?.metadata.name).toBe("Exported");
    expect(loaded?.metadata.playtime).toBe(42);
    expect(loaded?.metadata.sceneName).toBe("cave");
    expect(loaded?.metadata.slotId).toBe("imported");
    expect(loaded?.data).toEqual(baseState);
  });

  test("exportSlot returns null for missing slot", () => {
    const m = makeManager();
    expect(m.exportSlot("nope")).toBeNull();
  });

  test("importSlot rejects malformed JSON", () => {
    const m = makeManager();
    expect(m.importSlot("x", "{not json")).toBe(false);
    expect(m.exists("x")).toBe(false);
  });

  test("importSlot rejects JSON that isn't a valid slot shape", () => {
    const m = makeManager();
    expect(m.importSlot("x", JSON.stringify({ foo: "bar" }))).toBe(false);
    expect(m.importSlot("x", JSON.stringify({ metadata: { slotId: "x" }, data: 1 }))).toBe(false);
  });

  test("importSlot enforces maxSlots", () => {
    // Produce a valid exported slot JSON using a separate manager (distinct
    // prefix so its index doesn't leak into the target manager's view).
    const source = new SaveSlotManager<GameState>({ maxSlots: 5, prefix: "src:" });
    source.save("from", baseState);
    const json = source.exportSlot("from")!;

    // Target manager is full at maxSlots=1.
    const target = new SaveSlotManager<GameState>({ maxSlots: 1, prefix: "tgt:" });
    target.save("existing", baseState);
    // Importing a new slot when full should fail.
    expect(target.importSlot("new", json)).toBe(false);
    expect(target.exists("new")).toBe(false);
  });

  test("importSlot allows overwriting existing slot when full", () => {
    const a = new SaveSlotManager<GameState>({ maxSlots: 1, prefix: "src2:" });
    a.save("a", baseState, { name: "Fresh" });
    const json = a.exportSlot("a")!;

    const b = new SaveSlotManager<GameState>({ maxSlots: 1, prefix: "tgt2:" });
    b.save("a", baseState, { name: "Old" });
    expect(b.importSlot("a", json)).toBe(true);
    expect(b.load("a")?.metadata.name).toBe("Fresh");
  });
});

// ── Version / migration ─────────────────────────────────────────

describe("version migration", () => {
  test("onMigrate is called when saved version differs from manager version", () => {
    // First, save at version 1.0.
    const v1 = makeManager({ version: "1.0.0" });
    v1.save("slot-1", baseState, { name: "Legacy" });

    let migrationCalls = 0;
    const v2 = new SaveSlotManager<GameState>({
      version: "2.0.0",
      onMigrate: (old) => {
        migrationCalls++;
        return {
          metadata: { ...old.metadata, version: "2.0.0", name: "Migrated" },
          data: { ...(old.data as GameState), level: 99 },
        };
      },
    });

    const slot = v2.load("slot-1");
    expect(migrationCalls).toBe(1);
    expect(slot?.metadata.version).toBe("2.0.0");
    expect(slot?.metadata.name).toBe("Migrated");
    expect(slot?.data.level).toBe(99);
  });

  test("onMigrate returning null treats the slot as unreadable", () => {
    const v1 = makeManager({ version: "1.0.0" });
    v1.save("slot-1", baseState);

    const v2 = new SaveSlotManager<GameState>({
      version: "2.0.0",
      onMigrate: () => null,
    });

    expect(v2.load("slot-1")).toBeNull();
  });

  test("onMigrate is NOT called when versions match", () => {
    let calls = 0;
    const m = new SaveSlotManager<GameState>({
      version: "1.0.0",
      onMigrate: () => {
        calls++;
        return null;
      },
    });
    m.save("slot-1", baseState);
    m.load("slot-1");
    expect(calls).toBe(0);
  });

  test("onMigrate is not called when no manager version is set", () => {
    // Pre-existing slot has an explicit version.
    const legacy = makeManager({ version: "0.9.0" });
    legacy.save("slot-1", baseState);

    // Manager without a version shouldn't try to migrate.
    let calls = 0;
    const m = new SaveSlotManager<GameState>({
      onMigrate: () => {
        calls++;
        return null;
      },
    });
    expect(m.load("slot-1")).not.toBeNull();
    expect(calls).toBe(0);
  });

  test("load returns null when onMigrate throws", () => {
    const v1 = makeManager({ version: "1.0.0" });
    v1.save("slot-1", baseState);

    const v2 = new SaveSlotManager<GameState>({
      version: "2.0.0",
      onMigrate: () => {
        throw new Error("boom");
      },
    });
    expect(v2.load("slot-1")).toBeNull();
  });
});

// ── Robustness ──────────────────────────────────────────────────

describe("robustness", () => {
  test("load returns null for slots with invalid shape", () => {
    const m = makeManager({ prefix: "save:" });
    // Inject garbage at the slot's storage key.
    localStorage.setItem("ascii-game:save:slot-1", JSON.stringify({ foo: "bar" }));
    expect(m.load("slot-1")).toBeNull();
  });

  test("multiple managers with different prefixes do not collide", () => {
    const a = new SaveSlotManager<GameState>({ prefix: "a:" });
    const b = new SaveSlotManager<GameState>({ prefix: "b:" });

    a.save("slot-1", { ...baseState, level: 11 });
    b.save("slot-1", { ...baseState, level: 22 });

    expect(a.load("slot-1")?.data.level).toBe(11);
    expect(b.load("slot-1")?.data.level).toBe(22);

    a.delete("slot-1");
    expect(a.exists("slot-1")).toBe(false);
    expect(b.exists("slot-1")).toBe(true);
  });

  test("SaveSlot type parameter is preserved through load", () => {
    const m = makeManager();
    m.save("slot-1", { level: 3, hp: 90, inventory: ["bow"] });
    const slot: SaveSlot<GameState> | null = m.load("slot-1");
    // Type assertion — this is more a compile-time check, but also verifies shape.
    expect(slot?.data.inventory).toEqual(["bow"]);
  });
});
