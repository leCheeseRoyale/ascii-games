/**
 * TurnSync — lockstep multiplayer turn coordination over any NetworkAdapter.
 *
 * In turn-based multiplayer (roguelike, strategy, card games), the shared
 * turn can't advance until every player has submitted their move. TurnSync
 * sits on top of any `NetworkAdapter` and solves this:
 *
 *   1. Each client calls `submitMove(move)` when the local player acts.
 *   2. TurnSync broadcasts the move (tagged with the current turn number).
 *   3. When moves from every known player for the current turn are collected,
 *      `onTurnComplete` fires with the full `{ playerId: move }` map and the
 *      turn advances.
 *
 * Because every client runs the same simulation on the same inputs, no
 * authoritative server is required — this is pure *lockstep* netcode. It
 * works identically over `MockAdapter` (tests), `SocketAdapter` (via a relay
 * server), or any future transport.
 *
 * ### Requirements on the game
 *
 * - Game logic must be **deterministic** given the same inputs. Avoid
 *   `Math.random()` unless seeded; avoid wall-clock time in simulation.
 * - `playerIds` must be known up front and agreed upon by all peers.
 * - This adapter's peer id MUST appear in `playerIds` — spectators that just
 *   observe should use the raw adapter, not TurnSync.
 *
 * ### Timeouts
 *
 * If a player hangs or disconnects mid-turn, `turnTimeout` (ms) auto-completes
 * the turn with `null` moves for missing players. Games decide how to handle
 * nulls (skip the turn, kick the player, etc.).
 *
 * @example
 * ```ts
 * const sync = new TurnSync<Move>({
 *   adapter,
 *   playerIds: ['alice', 'bob'],
 *   turnTimeout: 15000,
 * });
 *
 * sync.onTurnComplete(({ turn, moves }) => {
 *   applyMoves(world, moves);      // same on every client → identical state
 *   render();
 * });
 *
 * input.onAction('end-turn', () => sync.submitMove(buildMove()));
 * ```
 */

import { NetEmitter, type NetworkAdapter, type Unsubscribe } from "./network-adapter";

// ── Public types ────────────────────────────────────────────────

/** Options for constructing a `TurnSync`. */
export interface TurnSyncOptions {
  /** Underlying transport — any NetworkAdapter. */
  adapter: NetworkAdapter;
  /**
   * All players that must submit each turn. MUST include `adapter.id` —
   * spectators should listen on the adapter directly, not via TurnSync.
   */
  playerIds: string[];
  /**
   * Auto-complete the turn after this many ms if any player hasn't submitted.
   * Missing moves come through as `null`. Default 0 = no timeout.
   * Timer starts when the FIRST submission for a turn arrives.
   */
  turnTimeout?: number;
  /**
   * Start listening on construction. Default true. Set false if you want to
   * wire up handlers first, then call `start()` yourself.
   */
  autoStart?: boolean;
  /**
   * Starting turn number. Default 0. Useful for resuming mid-game.
   */
  initialTurn?: number;
  /**
   * Opt-in to asymmetric-move mode where only a single "active" player needs
   * to submit to complete the turn. Off-turn players' moves are still
   * accepted (no throw) but don't trigger completion. Intended for card
   * games, strategy games, and anything with one active player per turn.
   * Default false = existing symmetric lockstep behavior.
   */
  asymmetric?: boolean;
  /**
   * Required when `asymmetric: true` — the id of the active player for the
   * current turn. Change between turns via `setActivePlayer(id)` (typically
   * from `onTurnComplete`).
   */
  activePlayerId?: string;
}

/** Payload delivered when a turn's moves are all in. */
export interface TurnCompleteEvent<TMove> {
  /** The turn number that just completed. */
  turn: number;
  /** Per-player moves. `null` = timed out, `undefined` never appears. */
  moves: Record<string, TMove | null>;
}

/**
 * Delivered when peers disagree about post-turn state. Use with
 * `submitStateHash()` — pass a hash that captures the deterministic game
 * state after applying the completed turn's moves. Any pair of hashes that
 * differ triggers this event.
 */
export interface DesyncEvent {
  /** The turn whose post-state the peers disagreed on. */
  turn: number;
  /** Per-player hash values as received. */
  hashes: Record<string, string | number>;
}

type TurnCompleteHandler<TMove> = (e: TurnCompleteEvent<TMove>) => void;
type MoveReceivedHandler<TMove> = (playerId: string, move: TMove, turn: number) => void;
type DesyncHandler = (e: DesyncEvent) => void;

// ── Internal wire protocol ──────────────────────────────────────

/**
 * Frame shape TurnSync sends over the adapter. The `__turnsync: true` tag
 * lets games share an adapter between TurnSync and other game-specific
 * messages — anything missing the tag is ignored by TurnSync.
 */
interface TurnSyncMoveFrame<TMove> {
  readonly __turnsync: true;
  readonly kind: "move";
  readonly turn: number;
  readonly playerId: string;
  readonly move: TMove;
}

interface TurnSyncStateFrame {
  readonly __turnsync: true;
  readonly kind: "state";
  readonly turn: number;
  readonly playerId: string;
  readonly hash: string | number;
}

type TurnSyncFrame<TMove> = TurnSyncMoveFrame<TMove> | TurnSyncStateFrame;

function isTurnSyncFrame(x: unknown): x is TurnSyncFrame<unknown> {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { __turnsync?: unknown; kind?: unknown; turn?: unknown; playerId?: unknown };
  if (o.__turnsync !== true) return false;
  if (typeof o.turn !== "number" || typeof o.playerId !== "string") return false;
  return o.kind === "move" || o.kind === "state";
}

// ── Implementation ──────────────────────────────────────────────

export class TurnSync<TMove = unknown> {
  private readonly adapter: NetworkAdapter;
  private readonly playerIdSet: Set<string>;
  private readonly turnTimeout: number;
  private readonly playerIdsOrdered: readonly string[];

  private _currentTurn: number;
  /** Moves submitted for the CURRENT turn. Cleared on advance. */
  private currentMoves = new Map<string, TMove | null>();
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly asymmetric: boolean;
  private _activePlayerId: string | null;

  private unsubAdapter: Unsubscribe | null = null;

  private readonly turnCompleteEmitter = new NetEmitter<TurnCompleteHandler<TMove>>();
  private readonly moveReceivedEmitter = new NetEmitter<MoveReceivedHandler<TMove>>();
  private readonly desyncEmitter = new NetEmitter<DesyncHandler>();

  /** State hashes collected for the most recently completed turn. */
  private stateHashes = new Map<string, string | number>();
  private stateHashTurn = -1;

  constructor(opts: TurnSyncOptions) {
    if (!opts.playerIds.includes(opts.adapter.id)) {
      throw new Error(
        `TurnSync: adapter.id "${opts.adapter.id}" is not in playerIds (${opts.playerIds.join(", ")}). ` +
          "Spectators should listen on the adapter directly.",
      );
    }
    this.adapter = opts.adapter;
    this.playerIdsOrdered = [...opts.playerIds];
    this.playerIdSet = new Set(opts.playerIds);
    this.turnTimeout = Math.max(0, opts.turnTimeout ?? 0);
    this._currentTurn = opts.initialTurn ?? 0;
    this.asymmetric = opts.asymmetric ?? false;
    if (this.asymmetric) {
      if (!opts.activePlayerId) {
        throw new Error("TurnSync: asymmetric mode requires activePlayerId");
      }
      if (!this.playerIdSet.has(opts.activePlayerId)) {
        throw new Error(`TurnSync: activePlayerId "${opts.activePlayerId}" is not in playerIds`);
      }
      this._activePlayerId = opts.activePlayerId;
    } else {
      this._activePlayerId = null;
    }

    if (opts.autoStart !== false) this.start();
  }

  // ── Read-only state ───────────────────────────────────────────

  /** The turn currently being played (0-indexed, increments on each complete). */
  get currentTurn(): number {
    return this._currentTurn;
  }

  /** Player IDs still owing a move this turn (excluding already-submitted). */
  get waitingFor(): readonly string[] {
    if (this.asymmetric && this._activePlayerId) {
      return this.currentMoves.has(this._activePlayerId) ? [] : [this._activePlayerId];
    }
    const out: string[] = [];
    for (const id of this.playerIdsOrdered) {
      if (!this.currentMoves.has(id)) out.push(id);
    }
    return out;
  }

  /** True iff every player has submitted (or timed out) for the current turn. */
  get isComplete(): boolean {
    if (this.asymmetric && this._activePlayerId) {
      return this.currentMoves.has(this._activePlayerId);
    }
    return this.currentMoves.size === this.playerIdsOrdered.length;
  }

  /**
   * Currently active player id in asymmetric mode. `null` in symmetric mode.
   */
  get activePlayerId(): string | null {
    return this._activePlayerId;
  }

  /**
   * Set the active player for the NEXT turn (or the current turn if no moves
   * have been accepted yet). Only meaningful in asymmetric mode. Typically
   * called from an `onTurnComplete` handler to rotate turn order.
   */
  setActivePlayer(id: string): void {
    if (!this.asymmetric) {
      throw new Error("TurnSync: setActivePlayer only valid in asymmetric mode");
    }
    if (!this.playerIdSet.has(id)) {
      throw new Error(`TurnSync: activePlayerId "${id}" is not in playerIds`);
    }
    this._activePlayerId = id;
  }

  /** Has the given player already submitted for the current turn? */
  hasSubmitted(playerId: string): boolean {
    return this.currentMoves.has(playerId);
  }

  /**
   * Move submitted by `playerId` for the current turn.
   * - `undefined` = not submitted yet
   * - `null` = timed out
   * - TMove = actual move
   */
  getMove(playerId: string): TMove | null | undefined {
    return this.currentMoves.get(playerId);
  }

  // ── Submissions ───────────────────────────────────────────────

  /**
   * Submit this peer's move for the current turn. Broadcasts to all other
   * players. Duplicate submissions are silently ignored.
   */
  submitMove(move: TMove): void {
    if (!this.started) return;
    const myId = this.adapter.id;
    if (this.currentMoves.has(myId)) return; // duplicate — ignore

    // Capture turn BEFORE local accept — `acceptMove` may complete the turn
    // and advance `_currentTurn`, which would make the outgoing frame carry
    // the wrong turn number and get rejected by other peers.
    const turnAtSubmit = this._currentTurn;

    // Broadcast first so other peers see the correct turn number. Local
    // accept may mutate state (advance) but by then the frame is already out.
    const frame: TurnSyncFrame<TMove> = {
      __turnsync: true,
      kind: "move",
      turn: turnAtSubmit,
      playerId: myId,
      move,
    };
    this.adapter.broadcast(frame);

    this.acceptMove(myId, move, turnAtSubmit);
  }

  // ── Control ───────────────────────────────────────────────────

  /** Begin listening for moves on the adapter. Safe to call multiple times. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubAdapter = this.adapter.onMessage((from, raw) => this.handleMessage(from, raw));
  }

  /** Stop listening. Pending moves are preserved for when you call `start()` again. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.unsubAdapter) {
      this.unsubAdapter();
      this.unsubAdapter = null;
    }
    this.clearTimeout();
  }

  /** Reset to turn 0, drop all pending moves. Does NOT stop/restart the adapter listener. */
  reset(): void {
    this._currentTurn = 0;
    this.currentMoves.clear();
    this.clearTimeout();
  }

  /**
   * Force-complete the current turn using whatever moves we have. Any missing
   * players become `null`. Useful if the game wants to skip a stuck turn.
   */
  advance(): void {
    this.completeTurn();
  }

  /**
   * Jump to a specific turn state. Useful on reconnect when the server
   * replays history up to the current turn. Optionally seeds moves for the
   * NEW `turn` (e.g., moves other peers already submitted but we missed).
   */
  rebase(turn: number, moves?: Record<string, TMove>): void {
    this._currentTurn = turn;
    this.currentMoves.clear();
    this.clearTimeout();
    if (moves) {
      for (const [id, move] of Object.entries(moves)) {
        if (!this.playerIdSet.has(id)) continue;
        this.currentMoves.set(id, move);
      }
      if (this.isComplete) {
        // Completing from rebase still fires the event.
        this.completeTurn();
      } else if (this.currentMoves.size > 0) {
        this.startTimeoutIfNeeded();
      }
    }
  }

  // ── Event subscriptions ───────────────────────────────────────

  onTurnComplete(handler: TurnCompleteHandler<TMove>): Unsubscribe {
    return this.turnCompleteEmitter.on(handler);
  }

  onMoveReceived(handler: MoveReceivedHandler<TMove>): Unsubscribe {
    return this.moveReceivedEmitter.on(handler);
  }

  /**
   * Fires when peers disagree about the state hash for a completed turn.
   * Only fired when game code calls `submitStateHash` for every player.
   */
  onDesync(handler: DesyncHandler): Unsubscribe {
    return this.desyncEmitter.on(handler);
  }

  /**
   * Broadcast a hash of this peer's post-turn state. When hashes from every
   * player arrive, TurnSync compares them and fires `onDesync` if any differ.
   * Call this from `onTurnComplete` after applying the turn's moves.
   *
   * The hash value is opaque — use whatever encoding works for your state
   * (JSON.stringify + crc32, a custom fold, etc.). Must be deterministic.
   */
  submitStateHash(hash: string | number): void {
    if (!this.started) return;
    // Tag with the turn number that JUST completed — the current turn has
    // advanced by the time game code calls this from onTurnComplete.
    const turnJustCompleted = this._currentTurn - 1;
    if (turnJustCompleted < 0) return;
    const frame: TurnSyncStateFrame = {
      __turnsync: true,
      kind: "state",
      turn: turnJustCompleted,
      playerId: this.adapter.id,
      hash,
    };
    this.adapter.broadcast(frame);
    this.acceptStateHash(this.adapter.id, turnJustCompleted, hash);
  }

  // ── Internal ──────────────────────────────────────────────────

  private handleMessage(_from: string, raw: unknown): void {
    if (!isTurnSyncFrame(raw)) return; // not a TurnSync frame — ignore
    const frame = raw as TurnSyncFrame<TMove>;

    // Unknown player — ignore
    if (!this.playerIdSet.has(frame.playerId)) return;

    if (frame.kind === "state") {
      this.acceptStateHash(frame.playerId, frame.turn, frame.hash);
      return;
    }

    // Wrong turn — out-of-order, ignore. (We don't queue future turns; if they
    // arrive, they'll replay next round after rebase or the game resyncs.)
    if (frame.turn !== this._currentTurn) return;

    // Duplicate — ignore silently
    if (this.currentMoves.has(frame.playerId)) return;

    this.acceptMove(frame.playerId, frame.move, frame.turn);
  }

  private acceptStateHash(playerId: string, turn: number, hash: string | number): void {
    // If a newer turn's hash arrives, discard stale collection.
    if (turn !== this.stateHashTurn) {
      this.stateHashTurn = turn;
      this.stateHashes.clear();
    }
    if (this.stateHashes.has(playerId)) return;
    this.stateHashes.set(playerId, hash);

    if (this.stateHashes.size === this.playerIdsOrdered.length) {
      const values = [...this.stateHashes.values()];
      const allEqual = values.every((v) => v === values[0]);
      if (!allEqual) {
        const hashes: Record<string, string | number> = {};
        for (const [id, h] of this.stateHashes) hashes[id] = h;
        this.desyncEmitter.emit({ turn, hashes });
      }
      // Start fresh for the next turn's hashes either way.
      this.stateHashes.clear();
      this.stateHashTurn = -1;
    }
  }

  private acceptMove(playerId: string, move: TMove, turn: number): void {
    this.currentMoves.set(playerId, move);
    this.moveReceivedEmitter.emit(playerId, move, turn);

    if (this.isComplete) {
      this.completeTurn();
    } else {
      this.startTimeoutIfNeeded();
    }
  }

  private startTimeoutIfNeeded(): void {
    if (this.turnTimeout <= 0) return;
    if (this.timeoutHandle !== null) return; // already armed
    this.timeoutHandle = setTimeout(() => {
      this.timeoutHandle = null;
      // Fill missing with null and complete
      for (const id of this.playerIdsOrdered) {
        if (!this.currentMoves.has(id)) this.currentMoves.set(id, null);
      }
      this.completeTurn();
    }, this.turnTimeout);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private completeTurn(): void {
    this.clearTimeout();

    // Build moves map — ensure every player is represented (null if missing)
    const moves: Record<string, TMove | null> = {};
    for (const id of this.playerIdsOrdered) {
      moves[id] = this.currentMoves.has(id) ? (this.currentMoves.get(id) as TMove | null) : null;
    }

    const event: TurnCompleteEvent<TMove> = {
      turn: this._currentTurn,
      moves,
    };

    // Advance state BEFORE emitting, so handlers can submit the next turn's
    // move during their callback without confusing the current-turn bookkeeping.
    this._currentTurn += 1;
    this.currentMoves.clear();

    this.turnCompleteEmitter.emit(event);
  }
}
