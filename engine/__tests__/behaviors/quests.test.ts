import { describe, expect, test } from "bun:test";
import { type QuestDefinition, QuestTracker } from "../../behaviors/quests";

// ── Fixtures ────────────────────────────────────────────────────

const ratsQuest: QuestDefinition = {
  id: "rats",
  name: "Rat Problem",
  description: "The innkeeper is desperate.",
  objectives: [
    { id: "kill", description: "Slay 5 rats", target: 5 },
    { id: "report", description: "Talk to the innkeeper" },
  ],
  rewards: { xp: 100, gold: 50 },
};

const bossQuest: QuestDefinition = {
  id: "ratking",
  name: "The Rat King",
  description: "Find and defeat the rat king.",
  prerequisites: ["rats"],
  objectives: [
    { id: "slay", description: "Slay the rat king" },
    { id: "loot", description: "Grab the crown", required: false },
  ],
  rewards: { xp: 500 },
};

const secretQuest: QuestDefinition = {
  id: "secret",
  name: "Hidden Vault",
  description: "...",
  prerequisites: ["ratking"],
  objectives: [{ id: "enter", description: "Enter the vault" }],
};

// ── register / registerAll ──────────────────────────────────────

describe("register / registerAll", () => {
  test("register creates a state with initial status", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    const state = qt.getState("rats");
    expect(state).toBeDefined();
    expect(state?.status).toBe("available");
    expect(state?.objectives.kill.progress).toBe(0);
    expect(state?.objectives.kill.done).toBe(false);
    expect(state?.objectives.report.done).toBe(false);
  });

  test("register starts quest as locked when prerequisites are unregistered", () => {
    const qt = new QuestTracker();
    qt.register(bossQuest); // prereq 'rats' not registered yet
    expect(qt.getState("ratking")?.status).toBe("locked");
  });

  test("registerAll registers multiple quests and respects prereqs across the set", () => {
    const qt = new QuestTracker();
    qt.registerAll([bossQuest, ratsQuest, secretQuest]);

    // rats has no prereqs → available
    expect(qt.getState("rats")?.status).toBe("available");
    // ratking requires rats (not completed) → locked
    expect(qt.getState("ratking")?.status).toBe("locked");
    // secret requires ratking (not completed) → locked
    expect(qt.getState("secret")?.status).toBe("locked");
  });

  test("getDefinition returns the registered definition", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    expect(qt.getDefinition("rats")?.name).toBe("Rat Problem");
    expect(qt.getDefinition("nope")).toBeUndefined();
  });

  test("getAll filters by status", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest]);

    expect(qt.getAll("available").map((q) => q.id)).toEqual(["rats"]);
    expect(qt.getAll("locked").map((q) => q.id)).toEqual(["ratking"]);
    expect(qt.getAll().length).toBe(2);
  });
});

// ── start() ─────────────────────────────────────────────────────

describe("start()", () => {
  test("moves available quest → active and fires start event", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    const seen: string[] = [];
    qt.on("start", (id) => seen.push(id));

    expect(qt.start("rats")).toBe(true);
    expect(qt.getState("rats")?.status).toBe("active");
    expect(qt.getState("rats")?.startedAt).toBeTypeOf("number");
    expect(seen).toEqual(["rats"]);
  });

  test("fails for locked quests", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest]);
    expect(qt.start("ratking")).toBe(false);
    expect(qt.getState("ratking")?.status).toBe("locked");
  });

  test("fails for unknown quests", () => {
    const qt = new QuestTracker();
    expect(qt.start("nope")).toBe(false);
  });

  test("fails if already active", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    expect(qt.start("rats")).toBe(false);
  });

  test("fails if already completed", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.complete("rats");
    expect(qt.start("rats")).toBe(false);
    expect(qt.getState("rats")?.status).toBe("completed");
  });

  test("fails if already failed", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.fail("rats");
    expect(qt.start("rats")).toBe(false);
  });
});

// ── progress() ──────────────────────────────────────────────────

describe("progress()", () => {
  test("adds to objective progress and fires progress events", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    const payloads: any[] = [];
    qt.on("progress", (id, data) => payloads.push({ id, data }));

    qt.progress("rats", "kill", 2);
    qt.progress("rats", "kill", 1);

    const state = qt.getState("rats");
    expect(state?.objectives.kill.progress).toBe(3);
    expect(state?.objectives.kill.done).toBe(false);
    expect(payloads.length).toBe(2);
    expect(payloads[0].data.progress).toBe(2);
    expect(payloads[1].data.progress).toBe(3);
    expect(payloads[0].data.target).toBe(5);
  });

  test("defaults amount to 1", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.progress("rats", "kill");
    qt.progress("rats", "kill");
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(2);
  });

  test("auto-completes objective when progress reaches target", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.progress("rats", "kill", 5);
    expect(qt.getState("rats")?.objectives.kill.done).toBe(true);
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(5);
  });

  test("clamps progress at target", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.progress("rats", "kill", 100);
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(5);
  });

  test("boolean objectives (no target) complete on progress of 1", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.progress("rats", "report");
    expect(qt.getState("rats")?.objectives.report.done).toBe(true);
    expect(qt.getState("rats")?.objectives.report.progress).toBe(1);
  });

  test("is a no-op on non-active quests", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    qt.progress("rats", "kill", 3); // not started
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(0);
  });

  test("is a no-op for unknown quest or objective", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.progress("nope", "kill", 3);
    qt.progress("rats", "bogus", 3);

    expect(qt.getState("rats")?.objectives.kill.progress).toBe(0);
  });

  test("progress does nothing once objective is already done", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.completeObjective("rats", "kill");

    const events: any[] = [];
    qt.on("progress", (_id, data) => events.push(data));
    qt.progress("rats", "kill", 100);

    // Progress was not re-emitted because the objective was already done.
    expect(events.length).toBe(0);
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(5);
  });
});

// ── completeObjective() ─────────────────────────────────────────

describe("completeObjective()", () => {
  test("marks an objective done regardless of progress amount", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    qt.completeObjective("rats", "kill");
    const os = qt.getState("rats")?.objectives.kill;
    expect(os?.done).toBe(true);
    expect(os?.progress).toBe(5);
  });

  test("auto-completes the quest when all required objectives are done", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    const completed: string[] = [];
    qt.on("complete", (id) => completed.push(id));

    qt.completeObjective("rats", "kill");
    qt.completeObjective("rats", "report");

    expect(qt.getState("rats")?.status).toBe("completed");
    expect(completed).toEqual(["rats"]);
  });

  test("is a no-op on non-active quests", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    qt.completeObjective("rats", "kill");
    expect(qt.getState("rats")?.objectives.kill.done).toBe(false);
  });
});

// ── Auto-completion with optional objectives ────────────────────

describe("optional objectives", () => {
  test("optional objectives do not block quest completion", () => {
    const qt = new QuestTracker();
    qt.register(bossQuest);
    qt.register(ratsQuest);
    qt.start("rats");
    qt.completeObjective("rats", "kill");
    qt.completeObjective("rats", "report");
    // rats is complete → ratking becomes available
    expect(qt.getState("ratking")?.status).toBe("available");

    qt.start("ratking");
    qt.completeObjective("ratking", "slay"); // only required objective

    expect(qt.getState("ratking")?.status).toBe("completed");
    // loot is still undone — optional
    expect(qt.getState("ratking")?.objectives.loot.done).toBe(false);
  });

  test("isComplete reports true once required objectives are done", () => {
    const qt = new QuestTracker();
    qt.register(bossQuest);
    qt.register(ratsQuest);
    qt.start("rats");
    qt.complete("rats");
    qt.start("ratking");

    expect(qt.isComplete("ratking")).toBe(false);
    qt.completeObjective("ratking", "slay");
    expect(qt.isComplete("ratking")).toBe(true);
  });

  test("isComplete returns false for unknown quests", () => {
    const qt = new QuestTracker();
    expect(qt.isComplete("nope")).toBe(false);
  });
});

// ── fail() ──────────────────────────────────────────────────────

describe("fail()", () => {
  test("sets status to failed and fires fail event", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    const seen: string[] = [];
    qt.on("fail", (id) => seen.push(id));
    qt.fail("rats");

    expect(qt.getState("rats")?.status).toBe("failed");
    expect(qt.getState("rats")?.completedAt).toBeTypeOf("number");
    expect(seen).toEqual(["rats"]);
  });

  test("does not re-fail an already-failed quest", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    const seen: string[] = [];
    qt.on("fail", (id) => seen.push(id));
    qt.fail("rats");
    qt.fail("rats");

    expect(seen).toEqual(["rats"]);
  });

  test("does not fail a completed quest", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.complete("rats");
    qt.fail("rats");

    expect(qt.getState("rats")?.status).toBe("completed");
  });
});

// ── complete() ──────────────────────────────────────────────────

describe("complete()", () => {
  test("force-completes and includes rewards in the event payload", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");

    let payload: any = null;
    qt.on("complete", (_id, data) => {
      payload = data;
    });

    qt.complete("rats");
    expect(qt.getState("rats")?.status).toBe("completed");
    expect(payload?.rewards?.xp).toBe(100);
    expect(payload?.rewards?.gold).toBe(50);
    // Required objectives are marked done.
    expect(qt.getState("rats")?.objectives.kill.done).toBe(true);
    expect(qt.getState("rats")?.objectives.report.done).toBe(true);
  });

  test("does nothing if already completed or failed", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.complete("rats");

    const seen: string[] = [];
    qt.on("complete", (id) => seen.push(id));
    qt.complete("rats"); // no-op
    expect(seen).toEqual([]);
  });
});

// ── Event listeners ─────────────────────────────────────────────

describe("on() event listeners", () => {
  test("fires events for start/progress/complete/fail", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    const events: string[] = [];
    qt.on("start", (id) => events.push(`start:${id}`));
    qt.on("progress", (id, data) => events.push(`progress:${id}:${data.objectiveId}`));
    qt.on("complete", (id) => events.push(`complete:${id}`));
    qt.on("fail", (id) => events.push(`fail:${id}`));

    qt.start("rats");
    qt.progress("rats", "kill", 1);
    qt.completeObjective("rats", "kill");
    qt.completeObjective("rats", "report");

    expect(events[0]).toBe("start:rats");
    expect(events).toContain("progress:rats:kill");
    expect(events).toContain("progress:rats:report");
    expect(events[events.length - 1]).toBe("complete:rats");
  });

  test("returns an unsubscribe function", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    const seen: string[] = [];
    const unsub = qt.on("start", (id) => seen.push(id));

    qt.start("rats");
    unsub();
    // Reset + second run to ensure the handler was unhooked.
    qt.fail("rats");
    qt.register({ ...ratsQuest, id: "rats2" });
    qt.start("rats2");

    expect(seen).toEqual(["rats"]);
  });

  test("multiple listeners for the same event all fire", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    const a: string[] = [];
    const b: string[] = [];
    qt.on("start", (id) => a.push(id));
    qt.on("start", (id) => b.push(id));

    qt.start("rats");

    expect(a).toEqual(["rats"]);
    expect(b).toEqual(["rats"]);
  });
});

// ── serialize / deserialize ─────────────────────────────────────

describe("serialize / deserialize", () => {
  test("round-trips quest state across a fresh tracker", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest]);
    qt.start("rats");
    qt.progress("rats", "kill", 3);

    const snapshot = qt.serialize();

    // Round-trip into a fresh tracker with the same definitions.
    const qt2 = new QuestTracker();
    qt2.registerAll([ratsQuest, bossQuest]);
    qt2.deserialize(snapshot);

    const restored = qt2.getState("rats");
    expect(restored?.status).toBe("active");
    expect(restored?.objectives.kill.progress).toBe(3);
    expect(restored?.objectives.kill.done).toBe(false);
    expect(restored?.objectives.report.done).toBe(false);
  });

  test("snapshot is independent from the live tracker (deep clone)", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);
    qt.start("rats");
    qt.progress("rats", "kill", 2);

    const snap = qt.serialize();
    // Mutating the live tracker should not affect the snapshot.
    qt.progress("rats", "kill", 2);
    expect(snap.rats.objectives.kill.progress).toBe(2);
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(4);
  });

  test("deserialize ignores quest ids that aren't registered", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    // ghost is not registered in this tracker — should be skipped silently.
    qt.deserialize({
      ghost: {
        id: "ghost",
        status: "active",
        objectives: {},
      } as any,
      rats: {
        id: "rats",
        status: "active",
        objectives: {
          kill: { progress: 4, done: false },
          report: { progress: 0, done: false },
        },
      },
    });

    expect(qt.getState("ghost")).toBeUndefined();
    expect(qt.getState("rats")?.objectives.kill.progress).toBe(4);
  });

  test("deserialize promotes locked quests whose prereqs are now completed", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest]);
    // Simulate a saved state where rats was completed but ratking is still locked.
    qt.deserialize({
      rats: {
        id: "rats",
        status: "completed",
        objectives: {
          kill: { progress: 5, done: true },
          report: { progress: 1, done: true },
        },
        completedAt: 1,
      },
      ratking: {
        id: "ratking",
        status: "locked",
        objectives: {
          slay: { progress: 0, done: false },
          loot: { progress: 0, done: false },
        },
      },
    });

    // refreshLocks should promote ratking to available.
    expect(qt.getState("ratking")?.status).toBe("available");
  });

  test("deserialize seeds missing objective entries for newly-added objectives", () => {
    const qt = new QuestTracker();
    qt.register(ratsQuest);

    // Save only contains `kill`; `report` was added to the definition later.
    qt.deserialize({
      rats: {
        id: "rats",
        status: "active",
        objectives: {
          kill: { progress: 2, done: false },
        },
      },
    });

    const state = qt.getState("rats");
    expect(state?.objectives.kill.progress).toBe(2);
    expect(state?.objectives.report).toEqual({ progress: 0, done: false });
  });
});

// ── Lock/unlock dynamics ────────────────────────────────────────

describe("locked → available transitions", () => {
  test("completing a prerequisite unlocks dependent quests", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest, secretQuest]);

    expect(qt.getState("ratking")?.status).toBe("locked");
    expect(qt.getState("secret")?.status).toBe("locked");

    qt.start("rats");
    qt.complete("rats");
    expect(qt.getState("ratking")?.status).toBe("available");
    // secret still locked — depends on ratking
    expect(qt.getState("secret")?.status).toBe("locked");

    qt.start("ratking");
    qt.completeObjective("ratking", "slay");
    expect(qt.getState("ratking")?.status).toBe("completed");
    expect(qt.getState("secret")?.status).toBe("available");
  });

  test("auto-completion via progress() also unlocks dependents", () => {
    const qt = new QuestTracker();
    qt.registerAll([ratsQuest, bossQuest]);
    qt.start("rats");

    qt.progress("rats", "kill", 5); // target reached
    qt.progress("rats", "report"); // boolean objective
    expect(qt.getState("rats")?.status).toBe("completed");
    expect(qt.getState("ratking")?.status).toBe("available");
  });

  test("quests without prerequisites start available immediately", () => {
    const qt = new QuestTracker();
    qt.register({
      id: "simple",
      name: "Simple",
      description: "",
      objectives: [{ id: "done", description: "done" }],
    });
    expect(qt.getState("simple")?.status).toBe("available");
  });
});
