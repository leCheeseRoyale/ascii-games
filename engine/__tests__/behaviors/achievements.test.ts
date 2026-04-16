import { beforeEach, describe, expect, test } from "bun:test";
import { type Achievement, AchievementTracker } from "../../behaviors/achievements";
import { setStoragePrefix } from "../../storage/storage";

// ── Fixtures ────────────────────────────────────────────────────

const firstBlood: Achievement = {
  id: "first-blood",
  name: "First Blood",
  description: "Defeat your first enemy.",
  condition: { type: "progress", target: 1 },
  points: 10,
  category: "combat",
};

const slayer: Achievement = {
  id: "slayer",
  name: "Slayer",
  description: "Defeat 100 enemies.",
  condition: { type: "progress", target: 100 },
  prerequisites: ["first-blood"],
  points: 100,
  category: "combat",
};

const perfectionist: Achievement = {
  id: "perfectionist",
  name: "Perfectionist",
  description: "Complete 3 levels without taking damage.",
  condition: { type: "event", eventName: "perfect-level", count: 3 },
  points: 50,
  category: "challenge",
};

const hiddenSecret: Achievement = {
  id: "secret",
  name: "Hidden Secret",
  description: "Discover the secret area.",
  condition: { type: "progress", target: 1 },
  hidden: true,
  points: 25,
};

const customAch: Achievement = {
  id: "explorer",
  name: "Explorer",
  description: "Visit every zone.",
  condition: {
    type: "custom",
    check: (t) => {
      // "Passes" when another achievement (first-blood) is unlocked — a stand-in
      // for any game-defined predicate.
      return !!t.getState("first-blood")?.unlocked;
    },
  },
  points: 20,
};

// ── register / registerAll ──────────────────────────────────────

describe("register / registerAll", () => {
  test("register creates an initial state", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);

    const s = at.getState("first-blood");
    expect(s).toBeDefined();
    expect(s?.unlocked).toBe(false);
    expect(s?.progress).toBe(0);
    expect(s?.unlockedAt).toBeUndefined();
  });

  test("registerAll registers many at once", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, slayer, perfectionist]);
    expect(at.getState("first-blood")).toBeDefined();
    expect(at.getState("slayer")).toBeDefined();
    expect(at.getState("perfectionist")).toBeDefined();
  });

  test("getDefinition returns the registered definition", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    expect(at.getDefinition("first-blood")?.name).toBe("First Blood");
    expect(at.getDefinition("nope")).toBeUndefined();
  });

  test("re-register does not wipe existing progress", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.progress("slayer", 42);
    // Re-registering shouldn't reset — games may re-call during hot-reload.
    at.register(slayer);
    expect(at.getState("slayer")?.progress).toBe(42);
  });
});

// ── progress() ──────────────────────────────────────────────────

describe("progress()", () => {
  test("adds to progress", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.unlock("first-blood"); // satisfy slayer prereq

    at.progress("slayer", 3);
    at.progress("slayer", 2);
    expect(at.getState("slayer")?.progress).toBe(5);
  });

  test("defaults amount to 1", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.progress("first-blood");
    expect(at.getState("first-blood")?.progress).toBe(1);
  });

  test("clamps progress at target", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.unlock("first-blood");

    at.progress("slayer", 999_999);
    expect(at.getState("slayer")?.progress).toBe(100);
  });

  test("auto-unlocks when target is reached", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.progress("first-blood", 1);
    expect(at.getState("first-blood")?.unlocked).toBe(true);
  });

  test("is a no-op for unknown id", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.progress("nope", 5);
    expect(at.getState("first-blood")?.progress).toBe(0);
  });

  test("is a no-op for event-type achievements", () => {
    const at = new AchievementTracker();
    at.register(perfectionist);
    at.progress("perfectionist", 5);
    // progress() shouldn't affect event-type achievements.
    expect(at.getState("perfectionist")?.progress).toBe(0);
  });

  test("does not re-progress an already-unlocked achievement", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.progress("first-blood", 1);
    expect(at.getState("first-blood")?.unlocked).toBe(true);
    // Extra progress should not bump the counter past target or re-fire events.
    at.progress("first-blood", 10);
    expect(at.getState("first-blood")?.progress).toBe(1);
  });
});

// ── recordEvent() ───────────────────────────────────────────────

describe("recordEvent()", () => {
  test("counts matching events correctly", () => {
    const at = new AchievementTracker();
    at.register(perfectionist);

    at.recordEvent("perfect-level");
    at.recordEvent("perfect-level");
    expect(at.getState("perfectionist")?.progress).toBe(2);
    expect(at.getState("perfectionist")?.unlocked).toBe(false);
  });

  test("ignores non-matching events", () => {
    const at = new AchievementTracker();
    at.register(perfectionist);

    at.recordEvent("something-else");
    expect(at.getState("perfectionist")?.progress).toBe(0);
  });

  test("auto-unlocks on final event", () => {
    const at = new AchievementTracker();
    at.register(perfectionist);

    at.recordEvent("perfect-level");
    at.recordEvent("perfect-level");
    at.recordEvent("perfect-level");
    expect(at.getState("perfectionist")?.unlocked).toBe(true);
  });

  test("advances every matching event-type achievement at once", () => {
    const at = new AchievementTracker();
    at.registerAll([
      {
        id: "pl1",
        name: "PL1",
        description: "",
        condition: { type: "event", eventName: "x", count: 1 },
      },
      {
        id: "pl2",
        name: "PL2",
        description: "",
        condition: { type: "event", eventName: "x", count: 2 },
      },
    ]);

    at.recordEvent("x");
    expect(at.getState("pl1")?.unlocked).toBe(true);
    expect(at.getState("pl2")?.progress).toBe(1);

    at.recordEvent("x");
    expect(at.getState("pl2")?.unlocked).toBe(true);
  });
});

// ── Prerequisites ───────────────────────────────────────────────

describe("prerequisites", () => {
  test("accumulates progress but does not unlock until prereqs are met", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.register(slayer);

    // Progress while first-blood isn't unlocked — slayer should track
    // but stay locked.
    at.progress("slayer", 100);
    expect(at.getState("slayer")?.progress).toBe(100);
    expect(at.getState("slayer")?.unlocked).toBe(false);

    // Unlock the prereq directly — slayer still won't flip until the next
    // progress() call since that's what re-runs the unlock check.
    at.progress("first-blood", 1);
    expect(at.getState("first-blood")?.unlocked).toBe(true);

    // Any progress() call re-runs tryUnlock (even if progress is clamped),
    // so one more call finalizes the unlock now that the prereq is met.
    at.progress("slayer", 1);
    expect(at.getState("slayer")?.unlocked).toBe(true);
  });

  test("prereqs met before reaching target — unlocks at target", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.register(slayer);

    at.unlock("first-blood");
    at.progress("slayer", 100);
    expect(at.getState("slayer")?.unlocked).toBe(true);
  });
});

// ── unlock() ────────────────────────────────────────────────────

describe("unlock()", () => {
  test("sets unlockedAt timestamp", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);

    const before = Date.now();
    at.unlock("first-blood");
    const after = Date.now();

    const s = at.getState("first-blood");
    expect(s?.unlocked).toBe(true);
    expect(s?.unlockedAt).toBeTypeOf("number");
    expect(s?.unlockedAt).toBeGreaterThanOrEqual(before);
    expect(s?.unlockedAt).toBeLessThanOrEqual(after);
  });

  test("fires unlock event once", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    const seen: string[] = [];
    at.on("unlock", (id) => seen.push(id));

    at.unlock("first-blood");
    at.unlock("first-blood"); // second call should no-op
    expect(seen).toEqual(["first-blood"]);
  });

  test("snaps progress to target on unlock", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.unlock("slayer");
    expect(at.getState("slayer")?.progress).toBe(100);
  });

  test("snaps event-type progress to count", () => {
    const at = new AchievementTracker();
    at.register(perfectionist);
    at.unlock("perfectionist");
    expect(at.getState("perfectionist")?.progress).toBe(3);
  });

  test("no-op for unknown id", () => {
    const at = new AchievementTracker();
    expect(() => at.unlock("nope")).not.toThrow();
  });
});

// ── Hidden achievements ─────────────────────────────────────────

describe("hidden achievements", () => {
  test("hidden achievements are filtered out of getAll by default", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, hiddenSecret]);

    const visible = at.getAll();
    expect(visible.map((s) => s.id)).toEqual(["first-blood"]);
  });

  test("includeHidden: true surfaces them", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, hiddenSecret]);

    const all = at.getAll({ includeHidden: true });
    expect(all.map((s) => s.id).sort()).toEqual(["first-blood", "secret"]);
  });

  test("hidden achievements appear in getAll once unlocked", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, hiddenSecret]);
    at.unlock("secret");

    const visible = at.getAll();
    expect(visible.map((s) => s.id).sort()).toEqual(["first-blood", "secret"]);
  });

  test("filters by unlocked and category", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, slayer, perfectionist]);
    at.unlock("first-blood");

    const unlocked = at.getAll({ unlocked: true });
    expect(unlocked.map((s) => s.id)).toEqual(["first-blood"]);

    const combat = at.getAll({ category: "combat" });
    expect(combat.map((s) => s.id).sort()).toEqual(["first-blood", "slayer"]);

    const challenge = at.getAll({ category: "challenge" });
    expect(challenge.map((s) => s.id)).toEqual(["perfectionist"]);
  });
});

// ── Custom conditions ───────────────────────────────────────────

describe("custom conditions", () => {
  test("checkCustom evaluates predicates and returns newly-unlocked ids", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, customAch]);

    // predicate false initially → no unlock
    expect(at.checkCustom()).toEqual([]);
    expect(at.getState("explorer")?.unlocked).toBe(false);

    // Satisfy the predicate and re-check.
    at.unlock("first-blood");
    const unlocked = at.checkCustom();
    expect(unlocked).toEqual(["explorer"]);
    expect(at.getState("explorer")?.unlocked).toBe(true);

    // Already-unlocked achievements aren't returned on subsequent calls.
    expect(at.checkCustom()).toEqual([]);
  });

  test("checkCustom swallows predicate exceptions", () => {
    const at = new AchievementTracker();
    at.register({
      id: "boom",
      name: "Boom",
      description: "",
      condition: {
        type: "custom",
        check: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => at.checkCustom()).not.toThrow();
    expect(at.getState("boom")?.unlocked).toBe(false);
  });

  test("checkCustom respects prerequisites", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.register({
      id: "gated",
      name: "Gated",
      description: "",
      prerequisites: ["first-blood"],
      condition: { type: "custom", check: () => true },
    });

    // prereq unmet → predicate true, but not unlocked
    expect(at.checkCustom()).toEqual([]);
    expect(at.getState("gated")?.unlocked).toBe(false);

    at.unlock("first-blood");
    expect(at.checkCustom()).toEqual(["gated"]);
  });
});

// ── Aggregates ──────────────────────────────────────────────────

describe("unlockedCount / totalPoints", () => {
  test("unlockedCount tallies unlocked achievements", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, slayer, perfectionist]);
    expect(at.unlockedCount()).toBe(0);

    at.unlock("first-blood");
    expect(at.unlockedCount()).toBe(1);

    at.unlock("perfectionist");
    expect(at.unlockedCount()).toBe(2);
  });

  test("totalPoints sums unlocked points (skipping undefined)", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, perfectionist]);
    at.register({
      id: "no-points",
      name: "",
      description: "",
      condition: { type: "progress", target: 1 },
    });

    expect(at.totalPoints()).toBe(0);
    at.unlock("first-blood"); // 10
    at.unlock("perfectionist"); // 50
    at.unlock("no-points"); // 0
    expect(at.totalPoints()).toBe(60);
  });
});

// ── Event listeners ─────────────────────────────────────────────

describe("on() event listeners", () => {
  test("fires progress events on each increment", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.unlock("first-blood");

    const events: Array<{ id: string; progress: number }> = [];
    at.on("progress", (id, state) => events.push({ id, progress: state.progress }));

    at.progress("slayer", 10);
    at.progress("slayer", 20);

    expect(events).toEqual([
      { id: "slayer", progress: 10 },
      { id: "slayer", progress: 30 },
    ]);
  });

  test("fires unlock event with state payload", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);

    const payloads: Array<{ id: string; unlocked: boolean }> = [];
    at.on("unlock", (id, state) => payloads.push({ id, unlocked: state.unlocked }));

    at.progress("first-blood", 1);
    expect(payloads).toEqual([{ id: "first-blood", unlocked: true }]);
  });

  test("returns an unsubscribe function", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);

    const seen: string[] = [];
    const off = at.on("unlock", (id) => seen.push(id));

    off();
    at.unlock("first-blood");
    expect(seen).toEqual([]);
  });

  test("supports multiple listeners per event", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);

    const a: string[] = [];
    const b: string[] = [];
    at.on("unlock", (id) => a.push(id));
    at.on("unlock", (id) => b.push(id));

    at.unlock("first-blood");
    expect(a).toEqual(["first-blood"]);
    expect(b).toEqual(["first-blood"]);
  });
});

// ── Serialize / deserialize ─────────────────────────────────────

describe("serialize / deserialize", () => {
  test("round-trips achievement state across a fresh tracker", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, slayer]);
    at.unlock("first-blood");
    at.progress("slayer", 42);

    const snapshot = at.serialize();

    const at2 = new AchievementTracker();
    at2.registerAll([firstBlood, slayer]);
    at2.deserialize(snapshot);

    expect(at2.getState("first-blood")?.unlocked).toBe(true);
    expect(at2.getState("first-blood")?.unlockedAt).toBeTypeOf("number");
    expect(at2.getState("slayer")?.progress).toBe(42);
    expect(at2.getState("slayer")?.unlocked).toBe(false);
  });

  test("snapshot is independent from the live tracker", () => {
    const at = new AchievementTracker();
    at.register(slayer);
    at.register(firstBlood);
    at.unlock("first-blood");
    at.progress("slayer", 10);

    const snap = at.serialize();
    at.progress("slayer", 10);

    expect(snap.slayer.progress).toBe(10);
    expect(at.getState("slayer")?.progress).toBe(20);
  });

  test("deserialize ignores unknown ids", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.deserialize({
      "first-blood": { id: "first-blood", unlocked: true, progress: 1, unlockedAt: 123 },
      ghost: { id: "ghost", unlocked: true, progress: 10 },
    });

    expect(at.getState("first-blood")?.unlocked).toBe(true);
    expect(at.getState("first-blood")?.unlockedAt).toBe(123);
    expect(at.getState("ghost")).toBeUndefined();
  });
});

// ── save / load ─────────────────────────────────────────────────

describe("save / load", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoragePrefix("ascii-game");
  });

  test("save writes to localStorage and load restores state", () => {
    const at = new AchievementTracker();
    at.registerAll([firstBlood, slayer]);
    at.unlock("first-blood");
    at.progress("slayer", 25);
    at.save();

    const at2 = new AchievementTracker();
    at2.registerAll([firstBlood, slayer]);
    expect(at2.load()).toBe(true);

    expect(at2.getState("first-blood")?.unlocked).toBe(true);
    expect(at2.getState("slayer")?.progress).toBe(25);
  });

  test("load returns false when no data exists", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    expect(at.load()).toBe(false);
  });

  test("custom storage key is respected", () => {
    const at = new AchievementTracker();
    at.register(firstBlood);
    at.unlock("first-blood");
    at.save("my-achievements");

    const at2 = new AchievementTracker();
    at2.register(firstBlood);
    // Default key has nothing.
    expect(at2.load()).toBe(false);
    // Custom key loads successfully.
    expect(at2.load("my-achievements")).toBe(true);
    expect(at2.getState("first-blood")?.unlocked).toBe(true);
  });
});
