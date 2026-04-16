/**
 * Currency wallet — reusable multi-currency economy for any game.
 *
 * A `CurrencyWallet` tracks named balances (gold, gems, mana, xp, tokens, ...)
 * with optional per-currency caps and an optional transaction history. All
 * helpers are pure and operate directly on the wallet. Pass the optional
 * `engine` + `entity` arguments to `add`, `spend`, `spendMulti`, or
 * `transfer` to opt into event emission (`currency:gained`,
 * `currency:spent`, `currency:insufficient`).
 *
 * Balances default to 0 when a currency has never been seen. Negative
 * balances are never stored. History uses a simple ring buffer capped by
 * `maxHistory` — the oldest entries are dropped when the buffer is full.
 *
 * @example
 * ```ts
 * import { createWallet, add, spendMulti, canAfford } from '@engine';
 *
 * const wallet = createWallet(
 *   { gold: 100, gems: 5 },
 *   { caps: { gold: 9999 }, trackHistory: true, maxHistory: 50 },
 * );
 *
 * add(wallet, 'gold', 50, 'quest-reward', engine, player);
 *
 * const shopCost = { gold: 80, gems: 1 };
 * if (canAfford(wallet, shopCost)) {
 *   spendMulti(wallet, shopCost, 'buy-sword', engine, player);
 * }
 * ```
 */

import { events } from "@shared/events";
import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";

// ── Public types ────────────────────────────────────────────────

/** Identifier for a currency (e.g., "gold", "gems", "xp"). */
export type CurrencyId = string;

/** A single recorded transaction in the wallet's history. */
export interface CurrencyTransaction {
  currency: CurrencyId;
  /** Positive = gain, negative = spend. */
  amount: number;
  /** Free-form reason tag for logging / analytics. */
  reason?: string;
  /** Milliseconds since epoch, from `Date.now()` at the time of the txn. */
  timestamp: number;
}

/** The component-shaped wallet — attach to an entity or hold standalone. */
export interface CurrencyWallet {
  /** Per-currency balance. Missing key means 0. */
  balances: Record<CurrencyId, number>;
  /** Optional per-currency max. Missing key means uncapped. */
  caps?: Record<CurrencyId, number>;
  /** Ring buffer of recent transactions. Present only when history is enabled. */
  history?: CurrencyTransaction[];
  /** Cap on history length. Ignored when `history` is undefined. */
  maxHistory?: number;
}

/** JSON-safe snapshot of a wallet for persistence. */
export interface SerializedWallet {
  balances: Record<CurrencyId, number>;
  caps?: Record<CurrencyId, number>;
  history?: CurrencyTransaction[];
  maxHistory?: number;
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Create a new wallet. All options are optional.
 *
 * @param initial Seed balances. Non-positive seed values are clamped to 0.
 * @param opts.caps Per-currency maximum balance.
 * @param opts.trackHistory Enable transaction history recording.
 * @param opts.maxHistory Ring-buffer cap. Default 100 when history is on.
 */
export function createWallet(
  initial?: Record<CurrencyId, number>,
  opts?: { caps?: Record<CurrencyId, number>; trackHistory?: boolean; maxHistory?: number },
): CurrencyWallet {
  const balances: Record<CurrencyId, number> = {};
  if (initial) {
    for (const key of Object.keys(initial)) {
      const v = initial[key];
      if (typeof v === "number" && v > 0) balances[key] = v;
      else balances[key] = 0;
    }
  }
  const wallet: CurrencyWallet = { balances };
  if (opts?.caps) wallet.caps = { ...opts.caps };
  if (opts?.trackHistory) {
    wallet.history = [];
    wallet.maxHistory = opts.maxHistory ?? 100;
  }
  // Clamp any initial over-cap balances.
  if (wallet.caps) {
    for (const key of Object.keys(wallet.caps)) {
      const cap = wallet.caps[key];
      if (typeof cap === "number" && (wallet.balances[key] ?? 0) > cap) {
        wallet.balances[key] = cap;
      }
    }
  }
  return wallet;
}

// ── Internal helpers ────────────────────────────────────────────

function recordTransaction(
  wallet: CurrencyWallet,
  currency: CurrencyId,
  amount: number,
  reason?: string,
): void {
  if (!wallet.history) return;
  wallet.history.push({
    currency,
    amount,
    reason,
    timestamp: Date.now(),
  });
  const cap = wallet.maxHistory ?? 100;
  while (wallet.history.length > cap) {
    wallet.history.shift();
  }
}

// ── Queries ─────────────────────────────────────────────────────

/** Get the current balance of a currency. Returns 0 for unseen currencies. */
export function getBalance(wallet: CurrencyWallet, currency: CurrencyId): number {
  return wallet.balances[currency] ?? 0;
}

/**
 * Check whether the wallet can cover every currency in `cost`. Zero or
 * negative costs always pass for that currency.
 */
export function canAfford(wallet: CurrencyWallet, cost: Record<CurrencyId, number>): boolean {
  for (const key of Object.keys(cost)) {
    const need = cost[key];
    if (!(need > 0)) continue; // zero / negative costs are free
    if (getBalance(wallet, key) < need) return false;
  }
  return true;
}

// ── Mutations ───────────────────────────────────────────────────

/**
 * Add `amount` of `currency` to the wallet.
 *
 * - No-op returning 0 when `amount <= 0`.
 * - Respects `wallet.caps[currency]` if set — caller receives the actual
 *   delta applied (may be less than requested).
 * - Initializes the currency balance to 0 if previously unseen.
 *
 * Emits `currency:gained` when an engine is supplied and some delta was added.
 */
export function add(
  wallet: CurrencyWallet,
  currency: CurrencyId,
  amount: number,
  reason?: string,
  engine?: Engine,
  entity?: Partial<Entity>,
): number {
  if (!(amount > 0)) return 0;

  const current = wallet.balances[currency] ?? 0;
  const cap = wallet.caps?.[currency];
  let applied = amount;
  if (typeof cap === "number") {
    const room = Math.max(0, cap - current);
    applied = Math.min(amount, room);
  }
  if (applied <= 0) return 0;

  wallet.balances[currency] = current + applied;
  recordTransaction(wallet, currency, applied, reason);

  if (engine) {
    events.emit("currency:gained" as any, {
      entity,
      currency,
      amount: applied,
      reason,
    });
  }

  return applied;
}

/**
 * Spend `amount` of `currency`. Returns `false` (no partial spend) if the
 * balance is below `amount` or `amount <= 0`. Emits `currency:spent` on
 * success, or `currency:insufficient` when rejected due to low balance.
 */
export function spend(
  wallet: CurrencyWallet,
  currency: CurrencyId,
  amount: number,
  reason?: string,
  engine?: Engine,
  entity?: Partial<Entity>,
): boolean {
  if (!(amount > 0)) return false;

  const current = wallet.balances[currency] ?? 0;
  if (current < amount) {
    if (engine) {
      events.emit("currency:insufficient" as any, {
        entity,
        currency,
        required: amount,
        available: current,
        reason,
      });
    }
    return false;
  }

  wallet.balances[currency] = current - amount;
  recordTransaction(wallet, currency, -amount, reason);

  if (engine) {
    events.emit("currency:spent" as any, {
      entity,
      currency,
      amount,
      reason,
    });
  }

  return true;
}

/**
 * Atomically spend a multi-currency cost like `{ gold: 50, gems: 1 }`.
 *
 * If ANY currency in `cost` is insufficient, nothing is deducted and the
 * function returns `false` (emitting `currency:insufficient` for the first
 * currency that fails). On success, every currency is deducted together
 * and a `currency:spent` event is emitted per currency.
 *
 * Zero or negative costs in `cost` are skipped.
 */
export function spendMulti(
  wallet: CurrencyWallet,
  cost: Record<CurrencyId, number>,
  reason?: string,
  engine?: Engine,
  entity?: Partial<Entity>,
): boolean {
  // Pre-check every currency so we never partially deduct.
  for (const key of Object.keys(cost)) {
    const need = cost[key];
    if (!(need > 0)) continue;
    const have = wallet.balances[key] ?? 0;
    if (have < need) {
      if (engine) {
        events.emit("currency:insufficient" as any, {
          entity,
          currency: key,
          required: need,
          available: have,
          reason,
        });
      }
      return false;
    }
  }

  // All currencies pass — deduct each one.
  for (const key of Object.keys(cost)) {
    const need = cost[key];
    if (!(need > 0)) continue;
    wallet.balances[key] = (wallet.balances[key] ?? 0) - need;
    recordTransaction(wallet, key, -need, reason);
    if (engine) {
      events.emit("currency:spent" as any, {
        entity,
        currency: key,
        amount: need,
        reason,
      });
    }
  }

  return true;
}

/**
 * Transfer up to `amount` of `currency` from `from` to `to`.
 *
 * Policy: transfers respect `to.caps`. If `to` can only partially accept
 * because of a cap, the function transfers as much as possible and still
 * returns `true`. Returns `false` only when `amount <= 0`, `from`'s balance
 * is below `amount`, or `to` has zero room (fully capped).
 *
 * Emits `currency:spent` on `from` and `currency:gained` on `to` for the
 * actual delta moved.
 */
export function transfer(
  from: CurrencyWallet,
  to: CurrencyWallet,
  currency: CurrencyId,
  amount: number,
  reason?: string,
  engine?: Engine,
  entity?: Partial<Entity>,
): boolean {
  if (!(amount > 0)) return false;

  const available = from.balances[currency] ?? 0;
  if (available < amount) {
    if (engine) {
      events.emit("currency:insufficient" as any, {
        entity,
        currency,
        required: amount,
        available,
        reason,
      });
    }
    return false;
  }

  // Figure out how much `to` can actually accept under its cap.
  const toCurrent = to.balances[currency] ?? 0;
  const toCap = to.caps?.[currency];
  let moveable = amount;
  if (typeof toCap === "number") {
    const room = Math.max(0, toCap - toCurrent);
    moveable = Math.min(amount, room);
  }
  if (moveable <= 0) return false;

  // Perform the move atomically.
  from.balances[currency] = available - moveable;
  to.balances[currency] = toCurrent + moveable;
  recordTransaction(from, currency, -moveable, reason);
  recordTransaction(to, currency, moveable, reason);

  if (engine) {
    events.emit("currency:spent" as any, {
      entity,
      currency,
      amount: moveable,
      reason,
    });
    events.emit("currency:gained" as any, {
      entity,
      currency,
      amount: moveable,
      reason,
    });
  }

  return true;
}

/**
 * Directly set a currency balance (bypasses events and history). Values
 * below 0 are clamped to 0. Values above an existing cap are clamped to
 * the cap.
 */
export function setBalance(wallet: CurrencyWallet, currency: CurrencyId, amount: number): void {
  let v = amount > 0 ? amount : 0;
  const cap = wallet.caps?.[currency];
  if (typeof cap === "number" && v > cap) v = cap;
  wallet.balances[currency] = v;
}

/**
 * Set or clear a currency cap.
 *
 * - Pass a number to install / update a cap. Any current balance above the
 *   new cap is clamped down to it.
 * - Pass `undefined` to remove the cap entirely.
 */
export function setCap(
  wallet: CurrencyWallet,
  currency: CurrencyId,
  cap: number | undefined,
): void {
  if (cap === undefined) {
    if (wallet.caps) delete wallet.caps[currency];
    return;
  }
  if (!wallet.caps) wallet.caps = {};
  wallet.caps[currency] = cap;
  const cur = wallet.balances[currency] ?? 0;
  if (cur > cap) wallet.balances[currency] = cap;
}

/** Remove all transactions (if history is enabled). No-op otherwise. */
export function clearHistory(wallet: CurrencyWallet): void {
  if (wallet.history) wallet.history.length = 0;
}

/**
 * Read the history, optionally filtered by currency and / or a minimum
 * timestamp. Returns an empty array if history is not enabled.
 */
export function getHistory(
  wallet: CurrencyWallet,
  filter?: { currency?: CurrencyId; since?: number },
): CurrencyTransaction[] {
  if (!wallet.history) return [];
  if (!filter) return wallet.history.slice();

  return wallet.history.filter((t) => {
    if (filter.currency !== undefined && t.currency !== filter.currency) return false;
    if (filter.since !== undefined && t.timestamp < filter.since) return false;
    return true;
  });
}

// ── Persistence ─────────────────────────────────────────────────

/** Serialize a wallet to a JSON-safe structure. */
export function serializeWallet(wallet: CurrencyWallet): SerializedWallet {
  const out: SerializedWallet = { balances: { ...wallet.balances } };
  if (wallet.caps) out.caps = { ...wallet.caps };
  if (wallet.history) {
    out.history = wallet.history.map((t) => ({ ...t }));
    out.maxHistory = wallet.maxHistory;
  }
  return out;
}

/** Rehydrate a previously serialized wallet. */
export function deserializeWallet(data: SerializedWallet): CurrencyWallet {
  const wallet: CurrencyWallet = {
    balances: { ...(data?.balances ?? {}) },
  };
  if (data?.caps) wallet.caps = { ...data.caps };
  if (Array.isArray(data?.history)) {
    wallet.history = data.history.map((t) => ({
      currency: t.currency,
      amount: t.amount,
      reason: t.reason,
      timestamp: t.timestamp,
    }));
    wallet.maxHistory = data.maxHistory ?? 100;
  }
  return wallet;
}
