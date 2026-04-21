import { describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import {
  add,
  canAfford,
  clearHistory,
  createWallet,
  deserializeWallet,
  getBalance,
  getHistory,
  serializeWallet,
  setBalance,
  setCap,
  spend,
  spendMulti,
  transfer,
} from "../../behaviors/currency";
import { mockEngine } from "../helpers";

// ── createWallet ────────────────────────────────────────────────

describe("createWallet", () => {
  test("creates an empty wallet by default", () => {
    const w = createWallet();
    expect(w.balances).toEqual({});
    expect(w.caps).toBeUndefined();
    expect(w.history).toBeUndefined();
    expect(w.maxHistory).toBeUndefined();
  });

  test("seeds initial balances", () => {
    const w = createWallet({ gold: 100, gems: 5 });
    expect(w.balances.gold).toBe(100);
    expect(w.balances.gems).toBe(5);
  });

  test("clamps negative or non-number initial balances to 0", () => {
    const w = createWallet({ gold: -50, gems: 0 });
    expect(w.balances.gold).toBe(0);
    expect(w.balances.gems).toBe(0);
  });

  test("stores caps when provided", () => {
    const w = createWallet(undefined, { caps: { gold: 999 } });
    expect(w.caps?.gold).toBe(999);
  });

  test("enables history when trackHistory is true", () => {
    const w = createWallet(undefined, { trackHistory: true });
    expect(Array.isArray(w.history)).toBe(true);
    expect(w.history?.length).toBe(0);
    expect(w.maxHistory).toBe(100);
  });

  test("honors custom maxHistory", () => {
    const w = createWallet(undefined, { trackHistory: true, maxHistory: 5 });
    expect(w.maxHistory).toBe(5);
  });

  test("clamps initial balance over cap", () => {
    const w = createWallet({ gold: 5000 }, { caps: { gold: 1000 } });
    expect(w.balances.gold).toBe(1000);
  });
});

// ── getBalance ──────────────────────────────────────────────────

describe("getBalance", () => {
  test("returns 0 for missing currency", () => {
    const w = createWallet();
    expect(getBalance(w, "gold")).toBe(0);
  });

  test("returns current value for known currency", () => {
    const w = createWallet({ gold: 42 });
    expect(getBalance(w, "gold")).toBe(42);
  });
});

// ── canAfford ───────────────────────────────────────────────────

describe("canAfford", () => {
  test("true when single currency is sufficient", () => {
    const w = createWallet({ gold: 100 });
    expect(canAfford(w, { gold: 50 })).toBe(true);
    expect(canAfford(w, { gold: 100 })).toBe(true);
  });

  test("false when single currency is insufficient", () => {
    const w = createWallet({ gold: 30 });
    expect(canAfford(w, { gold: 50 })).toBe(false);
  });

  test("true when multi-currency all sufficient", () => {
    const w = createWallet({ gold: 100, gems: 5 });
    expect(canAfford(w, { gold: 80, gems: 3 })).toBe(true);
  });

  test("false when any currency in multi-cost is insufficient", () => {
    const w = createWallet({ gold: 100, gems: 1 });
    expect(canAfford(w, { gold: 80, gems: 3 })).toBe(false);
  });

  test("zero/negative cost entries never block", () => {
    const w = createWallet({ gold: 0 });
    expect(canAfford(w, { gold: 0 })).toBe(true);
    expect(canAfford(w, { gold: -5 })).toBe(true);
  });
});

// ── add ─────────────────────────────────────────────────────────

describe("add", () => {
  test("adds to missing currency (initialized to 0)", () => {
    const w = createWallet();
    expect(add(w, "gold", 50)).toBe(50);
    expect(w.balances.gold).toBe(50);
  });

  test("stacks onto existing balance", () => {
    const w = createWallet({ gold: 20 });
    expect(add(w, "gold", 30)).toBe(30);
    expect(w.balances.gold).toBe(50);
  });

  test("returns 0 and does not mutate when amount <= 0", () => {
    const w = createWallet({ gold: 10 });
    expect(add(w, "gold", 0)).toBe(0);
    expect(add(w, "gold", -5)).toBe(0);
    expect(w.balances.gold).toBe(10);
  });

  test("respects cap and returns actual delta", () => {
    const w = createWallet({ gold: 90 }, { caps: { gold: 100 } });
    expect(add(w, "gold", 50)).toBe(10);
    expect(w.balances.gold).toBe(100);
  });

  test("returns 0 when already at cap", () => {
    const w = createWallet({ gold: 100 }, { caps: { gold: 100 } });
    expect(add(w, "gold", 50)).toBe(0);
    expect(w.balances.gold).toBe(100);
  });
});

// ── spend ──────────────────────────────────────────────────────

describe("spend", () => {
  test("deducts when balance is sufficient", () => {
    const w = createWallet({ gold: 100 });
    expect(spend(w, "gold", 40)).toBe(true);
    expect(w.balances.gold).toBe(60);
  });

  test("exact-match spend works", () => {
    const w = createWallet({ gold: 100 });
    expect(spend(w, "gold", 100)).toBe(true);
    expect(w.balances.gold).toBe(0);
  });

  test("returns false and does nothing when insufficient", () => {
    const w = createWallet({ gold: 20 });
    expect(spend(w, "gold", 50)).toBe(false);
    expect(w.balances.gold).toBe(20);
  });

  test("rejects non-positive amounts", () => {
    const w = createWallet({ gold: 20 });
    expect(spend(w, "gold", 0)).toBe(false);
    expect(spend(w, "gold", -5)).toBe(false);
    expect(w.balances.gold).toBe(20);
  });

  test("missing currency is treated as 0 balance", () => {
    const w = createWallet();
    expect(spend(w, "gold", 1)).toBe(false);
  });
});

// ── spendMulti ──────────────────────────────────────────────────

describe("spendMulti", () => {
  test("deducts every currency atomically on success", () => {
    const w = createWallet({ gold: 100, gems: 5 });
    expect(spendMulti(w, { gold: 50, gems: 2 })).toBe(true);
    expect(w.balances.gold).toBe(50);
    expect(w.balances.gems).toBe(3);
  });

  test("atomic rejection: nothing deducted if any currency is short", () => {
    const w = createWallet({ gold: 100, gems: 1 });
    expect(spendMulti(w, { gold: 50, gems: 5 })).toBe(false);
    // Nothing should have been deducted — both remain original.
    expect(w.balances.gold).toBe(100);
    expect(w.balances.gems).toBe(1);
  });

  test("skips zero / negative cost entries", () => {
    const w = createWallet({ gold: 100 });
    expect(spendMulti(w, { gold: 50, gems: 0, tokens: -5 })).toBe(true);
    expect(w.balances.gold).toBe(50);
    // No zero entries leak in.
    expect(w.balances.gems ?? undefined).toBeUndefined();
  });

  test("empty cost object succeeds as no-op", () => {
    const w = createWallet({ gold: 10 });
    expect(spendMulti(w, {})).toBe(true);
    expect(w.balances.gold).toBe(10);
  });
});

// ── transfer ────────────────────────────────────────────────────

describe("transfer", () => {
  test("moves from one wallet to another", () => {
    const from = createWallet({ gold: 100 });
    const to = createWallet();
    expect(transfer(from, to, "gold", 40)).toBe(true);
    expect(from.balances.gold).toBe(60);
    expect(to.balances.gold).toBe(40);
  });

  test("returns false when source is insufficient (nothing moved)", () => {
    const from = createWallet({ gold: 10 });
    const to = createWallet({ gold: 5 });
    expect(transfer(from, to, "gold", 50)).toBe(false);
    expect(from.balances.gold).toBe(10);
    expect(to.balances.gold).toBe(5);
  });

  test("partial transfer when destination hits its cap", () => {
    const from = createWallet({ gold: 100 });
    const to = createWallet({ gold: 90 }, { caps: { gold: 100 } });
    // Only 10 room on `to` — moves 10, returns true.
    expect(transfer(from, to, "gold", 50)).toBe(true);
    expect(from.balances.gold).toBe(90);
    expect(to.balances.gold).toBe(100);
  });

  test("returns false when destination is fully capped", () => {
    const from = createWallet({ gold: 100 });
    const to = createWallet({ gold: 100 }, { caps: { gold: 100 } });
    expect(transfer(from, to, "gold", 50)).toBe(false);
    expect(from.balances.gold).toBe(100);
    expect(to.balances.gold).toBe(100);
  });

  test("rejects non-positive amounts", () => {
    const from = createWallet({ gold: 10 });
    const to = createWallet();
    expect(transfer(from, to, "gold", 0)).toBe(false);
    expect(transfer(from, to, "gold", -5)).toBe(false);
  });
});

// ── setBalance / setCap ────────────────────────────────────────

describe("setBalance", () => {
  test("sets balance directly", () => {
    const w = createWallet({ gold: 10 });
    setBalance(w, "gold", 500);
    expect(w.balances.gold).toBe(500);
  });

  test("clamps negative to 0", () => {
    const w = createWallet({ gold: 10 });
    setBalance(w, "gold", -99);
    expect(w.balances.gold).toBe(0);
  });

  test("clamps to existing cap", () => {
    const w = createWallet({ gold: 10 }, { caps: { gold: 50 } });
    setBalance(w, "gold", 999);
    expect(w.balances.gold).toBe(50);
  });
});

describe("setCap", () => {
  test("installs a cap and clamps current balance", () => {
    const w = createWallet({ gold: 500 });
    setCap(w, "gold", 100);
    expect(w.caps?.gold).toBe(100);
    expect(w.balances.gold).toBe(100);
  });

  test("updates an existing cap", () => {
    const w = createWallet({ gold: 50 }, { caps: { gold: 100 } });
    setCap(w, "gold", 200);
    expect(w.caps?.gold).toBe(200);
    expect(w.balances.gold).toBe(50);
  });

  test("removes cap when passed undefined", () => {
    const w = createWallet({ gold: 50 }, { caps: { gold: 100 } });
    setCap(w, "gold", undefined);
    expect(w.caps?.gold).toBeUndefined();
    // No clamp anymore.
    setBalance(w, "gold", 9999);
    expect(w.balances.gold).toBe(9999);
  });
});

// ── History ────────────────────────────────────────────────────

describe("history", () => {
  test("add records a positive transaction", () => {
    const w = createWallet(undefined, { trackHistory: true });
    add(w, "gold", 50, "quest");
    expect(w.history?.length).toBe(1);
    expect(w.history?.[0].amount).toBe(50);
    expect(w.history?.[0].reason).toBe("quest");
  });

  test("spend records a negative transaction", () => {
    const w = createWallet({ gold: 100 }, { trackHistory: true });
    spend(w, "gold", 40, "shop");
    expect(w.history?.length).toBe(1);
    expect(w.history?.[0].amount).toBe(-40);
    expect(w.history?.[0].reason).toBe("shop");
  });

  test("ring buffer evicts oldest entries past maxHistory", () => {
    const w = createWallet(undefined, { trackHistory: true, maxHistory: 3 });
    add(w, "gold", 1, "a");
    add(w, "gold", 2, "b");
    add(w, "gold", 3, "c");
    add(w, "gold", 4, "d");
    expect(w.history?.length).toBe(3);
    expect(w.history?.[0].reason).toBe("b");
    expect(w.history?.[2].reason).toBe("d");
  });

  test("no history recorded when trackHistory is off", () => {
    const w = createWallet();
    add(w, "gold", 50);
    spend(w, "gold", 10);
    expect(w.history).toBeUndefined();
  });

  test("getHistory returns empty when history disabled", () => {
    const w = createWallet();
    expect(getHistory(w)).toEqual([]);
  });

  test("getHistory filters by currency", () => {
    const w = createWallet(undefined, { trackHistory: true });
    add(w, "gold", 10, "a");
    add(w, "gems", 5, "b");
    add(w, "gold", 20, "c");
    const gold = getHistory(w, { currency: "gold" });
    expect(gold.length).toBe(2);
    expect(gold.every((t) => t.currency === "gold")).toBe(true);
  });

  test("getHistory filters by since", () => {
    const w = createWallet(undefined, { trackHistory: true });
    add(w, "gold", 10, "old");
    // Manually adjust the first txn's timestamp into the past.
    if (w.history) w.history[0].timestamp = 100;
    add(w, "gold", 20, "new");
    const recent = getHistory(w, { since: 1000 });
    expect(recent.length).toBe(1);
    expect(recent[0].reason).toBe("new");
  });

  test("clearHistory empties the buffer without removing it", () => {
    const w = createWallet(undefined, { trackHistory: true });
    add(w, "gold", 50);
    clearHistory(w);
    expect(w.history?.length).toBe(0);
  });

  test("clearHistory is a no-op when history disabled", () => {
    const w = createWallet();
    expect(() => clearHistory(w)).not.toThrow();
  });
});

// ── Event emission ──────────────────────────────────────────────

describe("event emission", () => {
  test("add fires currency:gained when engine is supplied", () => {
    const w = createWallet();
    const engine = mockEngine();

    const silent: any[] = [];
    const loud: any[] = [];
    const silentHandler = (e: any) => silent.push(e);
    const loudHandler = (e: any) => loud.push(e);

    events.on("currency:gained" as any, silentHandler);
    add(w, "gold", 50); // no engine — no event
    events.off("currency:gained" as any, silentHandler);

    events.on("currency:gained" as any, loudHandler);
    add(w, "gold", 25, "reward", engine, { tags: { values: new Set() } });
    events.off("currency:gained" as any, loudHandler);

    expect(silent.length).toBe(0);
    expect(loud.length).toBe(1);
    expect(loud[0].currency).toBe("gold");
    expect(loud[0].amount).toBe(25);
    expect(loud[0].reason).toBe("reward");
  });

  test("spend fires currency:spent on success", () => {
    const w = createWallet({ gold: 100 });
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("currency:spent" as any, handler);
    spend(w, "gold", 30, "shop", engine);
    events.off("currency:spent" as any, handler);

    expect(received.length).toBe(1);
    expect(received[0].currency).toBe("gold");
    expect(received[0].amount).toBe(30);
    expect(received[0].reason).toBe("shop");
  });

  test("spend fires currency:insufficient on reject", () => {
    const w = createWallet({ gold: 10 });
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("currency:insufficient" as any, handler);
    spend(w, "gold", 50, "fail", engine);
    events.off("currency:insufficient" as any, handler);

    expect(received.length).toBe(1);
    expect(received[0].currency).toBe("gold");
    expect(received[0].required).toBe(50);
    expect(received[0].available).toBe(10);
    expect(received[0].reason).toBe("fail");
  });

  test("spendMulti emits one spent event per currency on success", () => {
    const w = createWallet({ gold: 100, gems: 5 });
    const engine = mockEngine();

    const received: any[] = [];
    const handler = (e: any) => received.push(e);
    events.on("currency:spent" as any, handler);
    spendMulti(w, { gold: 50, gems: 2 }, "craft", engine);
    events.off("currency:spent" as any, handler);

    expect(received.length).toBe(2);
    const currencies = received.map((r) => r.currency).sort();
    expect(currencies).toEqual(["gems", "gold"]);
  });

  test("spendMulti emits insufficient and nothing else on atomic reject", () => {
    const w = createWallet({ gold: 100, gems: 1 });
    const engine = mockEngine();

    const spent: any[] = [];
    const insufficient: any[] = [];
    const spentHandler = (e: any) => spent.push(e);
    const insHandler = (e: any) => insufficient.push(e);
    events.on("currency:spent" as any, spentHandler);
    events.on("currency:insufficient" as any, insHandler);
    const ok = spendMulti(w, { gold: 50, gems: 5 }, "craft", engine);
    events.off("currency:spent" as any, spentHandler);
    events.off("currency:insufficient" as any, insHandler);

    expect(ok).toBe(false);
    expect(spent.length).toBe(0);
    expect(insufficient.length).toBe(1);
    expect(insufficient[0].currency).toBe("gems");
  });

  test("transfer fires both spent and gained", () => {
    const from = createWallet({ gold: 100 });
    const to = createWallet();
    const engine = mockEngine();

    const spent: any[] = [];
    const gained: any[] = [];
    events.on("currency:spent" as any, (e: any) => spent.push(e));
    events.on("currency:gained" as any, (e: any) => gained.push(e));
    transfer(from, to, "gold", 25, "gift", engine);
    // Clean up.
    events.off("currency:spent" as any);
    events.off("currency:gained" as any);

    expect(spent.length).toBe(1);
    expect(gained.length).toBe(1);
    expect(spent[0].amount).toBe(25);
    expect(gained[0].amount).toBe(25);
  });
});

// ── Persistence ────────────────────────────────────────────────

describe("serializeWallet / deserializeWallet", () => {
  test("round-trips balances", () => {
    const w = createWallet({ gold: 100, gems: 5 });
    const data = serializeWallet(w);
    const w2 = deserializeWallet(data);
    expect(w2.balances).toEqual({ gold: 100, gems: 5 });
  });

  test("round-trips caps", () => {
    const w = createWallet({ gold: 10 }, { caps: { gold: 999 } });
    const w2 = deserializeWallet(serializeWallet(w));
    expect(w2.caps?.gold).toBe(999);
  });

  test("round-trips history", () => {
    const w = createWallet(undefined, { trackHistory: true, maxHistory: 10 });
    add(w, "gold", 50, "a");
    spend(w, "gold", 20, "b");
    const w2 = deserializeWallet(serializeWallet(w));
    expect(w2.history?.length).toBe(2);
    expect(w2.maxHistory).toBe(10);
    expect(w2.history?.[0].amount).toBe(50);
    expect(w2.history?.[1].amount).toBe(-20);
  });

  test("deserialize with missing history leaves it undefined", () => {
    const w = createWallet({ gold: 10 });
    const w2 = deserializeWallet(serializeWallet(w));
    expect(w2.history).toBeUndefined();
  });

  test("serialize does not share references with source wallet", () => {
    const w = createWallet({ gold: 100 });
    const data = serializeWallet(w);
    data.balances.gold = 999;
    expect(w.balances.gold).toBe(100);
  });
});
