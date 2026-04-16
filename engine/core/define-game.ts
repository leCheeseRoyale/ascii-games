/**
 * defineGame — declarative, boardgame.io-style game definition API.
 *
 * Wraps the existing ECS + scene + turn-manager primitives in a single
 * ergonomic object. Users describe their game's state, moves, phases, and
 * turn order; the engine auto-wires a scene, rotates turns after each move,
 * gates phase transitions, and reports game-over.
 *
 * The generated scene is registered on `engine.runGame(def)`, which returns
 * the starting scene name so setupGame can pass it up to GameCanvas.
 *
 * @example
 * ```ts
 * const ticTacToe = defineGame<{ board: (string | null)[] }>({
 *   name: 'tic-tac-toe',
 *   players: { min: 2, max: 2, default: 2 },
 *   setup: () => ({ board: Array(9).fill(null) }),
 *   turns: { order: ['X', 'O'] },
 *   moves: {
 *     place(ctx, idx: number) {
 *       if (ctx.state.board[idx] !== null) return 'invalid';
 *       ctx.state.board[idx] = ctx.currentPlayer as string;
 *     },
 *   },
 *   endIf: (ctx) => ctx.state.board.every(c => c !== null) ? { draw: true } : undefined,
 * });
 *
 * export function setupGame(engine: Engine) {
 *   return { startScene: engine.runGame(ticTacToe) };
 * }
 * ```
 *
 * Design notes:
 * - State is owned by the engine; `ctx.state` is a live reference that
 *   callbacks mutate directly. Moves run synchronously, so this is safe.
 * - `ctx.random()` is a deterministic seeded RNG — required for future
 *   lockstep multiplayer so all peers roll the same values. Pass
 *   `{ seed: N }` to `setup` via `def.seed` for reproducibility.
 * - Moves that return `'invalid'` are rejected: state is untouched, turn
 *   does not advance, and nothing is logged.
 * - `endIf` on a phase switches to the returned phase name; `endIf` at
 *   game level halts further moves and stores the result on `ctx.result`.
 * - Systems in `def.systems` are added after the engine's built-ins on
 *   scene load. Custom `render(ctx)` is called each frame via the scene's
 *   `update` hook — users who want full control can omit it and use
 *   systems instead.
 */

import { createSeededRandom } from "../behaviors/loot";
import type { System } from "../ecs/systems";
import type { Engine } from "./engine";
import { defineScene, type Scene } from "./scene";

// ── Public types ────────────────────────────────────────────────

/** Return value of a move. `'invalid'` rejects the move. */
export type MoveResult = void | "invalid";

/** A single move — receives a live `ctx` and any caller arguments. */
export type MoveFn<
  TState,
  TArgs extends any[] = any[],
  TPlayer extends string | number = string | number,
> = (ctx: GameContext<TState, TPlayer>, ...args: TArgs) => MoveResult;

/** Map of move name → move function. */
export type MovesMap<TState, TPlayer extends string | number = string | number> = Record<
  string,
  MoveFn<TState, any[], TPlayer>
>;

/** Bound moves: same names, with the ctx pre-bound so callers just pass args. */
export type BoundMoves<TState, TMoves extends MovesMap<TState>> = {
  [K in keyof TMoves]: TMoves[K] extends (ctx: any, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;
};

/** Result returned by top-level `endIf` — anything truthy halts the game. */
export type GameResult = { winner?: string | number; draw?: boolean } & Record<string, unknown>;

/** Context passed to every callback. */
export interface GameContext<TState, TPlayer extends string | number = string | number> {
  /** Full engine instance for imperative operations (spawn, ui, toast, etc.). */
  engine: Engine;
  /** Mutable game state. Mutate directly inside moves. */
  state: TState;
  /** Current phase name, or `null` if phases are not configured. */
  phase: string | null;
  /** 1-based turn number. */
  turn: number;
  /** Current player id (value from `turns.order`, or 1-based index if no order). */
  currentPlayer: TPlayer;
  /** 1-based index into `players` (fallback when `turns.order` is unset). */
  playerIndex: number;
  /** Number of players. */
  numPlayers: number;
  /** Bound moves — call as `ctx.moves.placeMark(5)`. Returns `'invalid'` if
   * rejected, `'game-over'` if dispatched after the game ended. */
  moves: Record<string, (...args: any[]) => MoveResult | "game-over">;
  /** Deterministic seeded RNG in [0, 1). */
  random: () => number;
  /** Append a line to the game's history log. */
  log: (msg: string) => void;
  /** Final result, once `endIf` has fired. `null` while the game is live. */
  result: GameResult | null;
  /** Advance to the next player immediately. Called automatically after moves by default. */
  endTurn: () => void;
  /** Advance to the next phase. No-op if phases aren't configured. */
  endPhase: () => void;
  /** Jump to a specific phase by name. */
  goToPhase: (phaseName: string) => void;
}

/**
 * Convenience alias for the subset of `GameContext` that move-input helpers
 * typically need (engine + bound moves + live state/result + current player).
 * Lets callers type locally-declared input helpers without redeclaring the
 * full context shape.
 */
export type MoveInputCtx<TState, TPlayer extends string | number = string | number> = Pick<
  GameContext<TState, TPlayer>,
  "engine" | "moves" | "state" | "result" | "currentPlayer"
>;

/** Per-phase config. */
export interface PhaseConfig<TState, TPlayer extends string | number = string | number> {
  /** Called when entering this phase. */
  onEnter?: (ctx: GameContext<TState, TPlayer>) => void;
  /** Called when leaving this phase. */
  onExit?: (ctx: GameContext<TState, TPlayer>) => void;
  /**
   * Checked after each move. Return a phase name to switch, or anything
   * falsy to stay. Useful for `winner ? 'gameOver' : null`.
   */
  endIf?: (ctx: GameContext<TState, TPlayer>) => string | null | undefined;
  /** Restrict moves to a whitelist while this phase is active. */
  moves?: string[];
}

/** Turn-order config. */
export interface TurnsConfig<TPlayer extends string | number = string | number> {
  /**
   * Ordered list of player ids. `currentPlayer` rotates through these.
   * Defaults to 1..numPlayers if omitted.
   */
  order?: readonly TPlayer[];
  /**
   * Auto-advance turn after each successful move. Default `true`. Set false
   * to let moves call `ctx.endTurn()` explicitly (e.g. multi-action turns).
   */
  autoEnd?: boolean;
}

/** Players config. */
export interface PlayersConfig {
  min?: number;
  max?: number;
  default?: number;
}

/** Setup context — receives a trimmed context at game start. */
export interface SetupContext {
  numPlayers: number;
  random: () => number;
  engine: Engine;
}

/** The full game definition. */
export interface GameDefinition<TState = any, TPlayer extends string | number = string | number> {
  name: string;
  players?: PlayersConfig;
  /** Optional deterministic seed — if set, `ctx.random()` is reproducible across runs. */
  seed?: number;
  /** Construct initial state. Called once on game start. */
  setup: (ctx: SetupContext) => TState;
  /** Turn rotation config. */
  turns?: TurnsConfig<TPlayer>;
  /**
   * Named phases. The `order` array lists phase names; additional keys
   * provide per-phase config. Typed loosely so TypeScript doesn't complain
   * about mixing `order` (string[]) with phase configs under one object.
   */
  phases?: {
    /** Ordered phase names. The first is entered on start. */
    order: string[];
    [phaseName: string]: PhaseConfig<TState, TPlayer> | string[];
  };
  /** All moves, keyed by name. */
  moves: MovesMap<TState, TPlayer>;
  /** If truthy, the game is over. Return value is stored on `ctx.result`. */
  endIf?: (ctx: GameContext<TState, TPlayer>) => GameResult | null | undefined | void;
  /** Extra systems to register alongside the built-in ones. */
  systems?: System[];
  /** Called every frame from the scene's update hook. Use `engine.ui.*` to draw. */
  render?: (ctx: GameContext<TState, TPlayer>) => void;
  /** Override the generated scene name. Default `'play'`. */
  startScene?: string;
}

/**
 * Identity helper that captures the generic state type so users get
 * full autocomplete on `ctx.state` inside moves without manual type args.
 *
 * The `const` modifier on `TPlayer` lets TypeScript infer literal-union
 * player types from an inline `turns.order: ['X', 'O']` — no `as const`
 * needed — so `ctx.currentPlayer` narrows to `'X' | 'O'` automatically.
 */
export function defineGame<TState = any, const TPlayer extends string | number = string | number>(
  def: GameDefinition<TState, TPlayer>,
): GameDefinition<TState, TPlayer> {
  return def;
}

// ── Runtime ─────────────────────────────────────────────────────

/**
 * Internal runtime that owns game state and dispatches moves. Exposed via
 * `engine.runGame(def)` — games almost never instantiate this directly.
 */
export class GameRuntime<TState, TPlayer extends string | number = string | number> {
  readonly def: GameDefinition<TState, TPlayer>;
  private engine: Engine;
  private state!: TState;
  private _turn = 1;
  private _playerIndex = 0;
  private _result: GameResult | null = null;
  private _history: string[] = [];
  private _random: () => number;
  private _order: TPlayer[];
  private _numPlayers: number;
  private _phaseOrder: string[] = [];
  private _currentPhase: string | null = null;
  private _boundMoves: Record<string, (...args: any[]) => MoveResult | "game-over"> = {};

  constructor(def: GameDefinition<TState, TPlayer>, engine: Engine) {
    this.def = def;
    this.engine = engine;
    this._random = createSeededRandom(def.seed);
    this._numPlayers = def.players?.default ?? def.turns?.order?.length ?? 2;
    // Default turn order: use configured ids or 1..N.
    this._order =
      def.turns?.order && def.turns.order.length > 0
        ? ([...def.turns.order] as TPlayer[])
        : (Array.from({ length: this._numPlayers }, (_, i) => i + 1) as TPlayer[]);
    this._phaseOrder = def.phases?.order ?? [];
    for (const name of Object.keys(def.moves)) {
      this._boundMoves[name] = (...args: any[]) => this.dispatch(name, args);
    }
  }

  /** Current game state (live reference). */
  get gameState(): TState {
    return this.state;
  }

  /** Final result once the game is over; `null` while live. */
  get result(): GameResult | null {
    return this._result;
  }

  /** Current turn number (1-based). */
  get turn(): number {
    return this._turn;
  }

  /** Current player id. */
  get currentPlayer(): TPlayer {
    return this._order[this._playerIndex];
  }

  /** Current phase, or `null` if phases aren't configured. */
  get phase(): string | null {
    return this._currentPhase;
  }

  /** History log. */
  get history(): readonly string[] {
    return this._history;
  }

  /** Start the game. Runs `setup`, configures turns, enters the first phase. */
  start(): void {
    this.state = this.def.setup({
      numPlayers: this._numPlayers,
      random: this._random,
      engine: this.engine,
    });
    this._turn = 1;
    this._playerIndex = 0;
    this._result = null;
    this._history = [];

    if (this._phaseOrder.length > 0) {
      this.engine.turns.configure({ phases: this._phaseOrder });
      this.engine.turns.start();
      this._currentPhase = this._phaseOrder[0];
      this.phaseCfg(this._currentPhase)?.onEnter?.(this.buildCtx());
    }
  }

  /** Look up a phase config by name. Typed narrowly so TS trusts it. */
  private phaseCfg(name: string): PhaseConfig<TState, TPlayer> | undefined {
    const p = this.def.phases;
    if (!p) return undefined;
    const v = p[name];
    return Array.isArray(v) ? undefined : (v as PhaseConfig<TState, TPlayer> | undefined);
  }

  /**
   * Dispatch a move by name. Returns `'invalid'` if the move rejected,
   * `'game-over'` if the game has already ended, or `undefined` on success.
   */
  dispatch(name: string, args: any[]): MoveResult | "game-over" {
    if (this._result !== null) return "game-over";

    const moveFn = this.def.moves[name];
    if (!moveFn) {
      console.warn(`[defineGame] unknown move "${name}"`);
      return "invalid";
    }

    // Phase move whitelist.
    if (this._currentPhase) {
      const phaseCfg = this.phaseCfg(this._currentPhase);
      if (phaseCfg?.moves && !phaseCfg.moves.includes(name)) {
        return "invalid";
      }
    }

    const ctx = this.buildCtx();
    const res = moveFn(ctx, ...args);
    if (res === "invalid") return "invalid";

    // Check phase endIf.
    if (this._currentPhase) {
      const phaseCfg = this.phaseCfg(this._currentPhase);
      const next = phaseCfg?.endIf?.(this.buildCtx());
      if (next) this.switchPhase(next);
    }

    // Check top-level endIf — game over?
    const gameResult = this.def.endIf?.(this.buildCtx());
    if (gameResult) {
      this._result = gameResult as GameResult;
      return undefined;
    }

    // Auto-rotate turn.
    if (this.def.turns?.autoEnd !== false) {
      this.endTurn();
    }
    return undefined;
  }

  /** Advance to the next player, incrementing turn when wrapping. */
  endTurn(): void {
    this._playerIndex = (this._playerIndex + 1) % this._order.length;
    if (this._playerIndex === 0) this._turn++;
  }

  /** Advance to the next phase. */
  endPhase(): void {
    if (this._phaseOrder.length === 0) return;
    const idx = this._phaseOrder.indexOf(this._currentPhase ?? "");
    const next = this._phaseOrder[(idx + 1) % this._phaseOrder.length];
    this.switchPhase(next);
  }

  /** Jump to a specific phase by name. */
  goToPhase(phaseName: string): void {
    if (!this._phaseOrder.includes(phaseName)) {
      throw new Error(`[defineGame] unknown phase "${phaseName}"`);
    }
    this.switchPhase(phaseName);
  }

  private switchPhase(next: string): void {
    if (next === this._currentPhase) return;
    const oldCfg = this._currentPhase ? this.phaseCfg(this._currentPhase) : undefined;
    oldCfg?.onExit?.(this.buildCtx());
    this._currentPhase = next;
    try {
      this.engine.turns.goToPhase(next);
    } catch {
      // TurnManager wasn't configured with this phase name — no-op.
    }
    this.phaseCfg(next)?.onEnter?.(this.buildCtx());
  }

  /** Tick callback for the generated scene's update hook. */
  tick(_dt: number): void {
    if (this.def.render) {
      this.def.render(this.buildCtx());
    }
  }

  /** Build a fresh ctx object. Cheap — called per callback invocation. */
  buildCtx(): GameContext<TState, TPlayer> {
    return {
      engine: this.engine,
      state: this.state,
      phase: this._currentPhase,
      turn: this._turn,
      currentPlayer: this.currentPlayer,
      playerIndex: this._playerIndex,
      numPlayers: this._numPlayers,
      moves: this._boundMoves,
      random: this._random,
      log: (msg: string) => {
        this._history.push(msg);
      },
      result: this._result,
      endTurn: () => this.endTurn(),
      endPhase: () => this.endPhase(),
      goToPhase: (name: string) => this.goToPhase(name),
    };
  }
}

// ── Scene wiring ────────────────────────────────────────────────

/**
 * Build the auto-generated scene that `engine.runGame` registers. Exposed
 * so tests and tools can introspect what got registered.
 */
export function buildGameScene<TState, TPlayer extends string | number = string | number>(
  def: GameDefinition<TState, TPlayer>,
  runtime: GameRuntime<TState, TPlayer>,
): Scene {
  const sceneName = def.startScene ?? "play";
  return defineScene({
    name: sceneName,
    setup(engine) {
      runtime.start();
      for (const sys of def.systems ?? []) {
        engine.addSystem(sys);
      }
    },
    update(_engine, dt) {
      runtime.tick(dt);
    },
    cleanup(engine) {
      engine.turns.stop();
      for (const sys of def.systems ?? []) {
        engine.removeSystem(sys.name);
      }
    },
  });
}
