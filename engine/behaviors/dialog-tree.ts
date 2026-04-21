/**
 * Branching dialog tree runner.
 *
 * A dialog tree is a graph of nodes. Each node has a speaker, text, and either
 * follow-up nodes or choices that lead to different nodes. This enables RPGs,
 * adventures, and visual-novel-style conversations on top of the basic
 * `engine.dialog.show()` / `engine.dialog.choice()` primitives.
 *
 * Example:
 *   const tree: DialogTree = {
 *     start: "greeting",
 *     nodes: {
 *       greeting: {
 *         id: "greeting",
 *         speaker: "Merchant",
 *         text: "Hello traveler!",
 *         choices: [
 *           { text: "Browse wares", next: "shop" },
 *           { text: "Leave", next: null },
 *         ],
 *       },
 *       shop: { id: "shop", text: "[wares list]", next: null },
 *     },
 *   };
 *   const flags = await runDialogTree(engine, tree, { visited: true });
 */

// ── Types ──────────────────────────────────────────────────────────

/** Border styles supported by the underlying DialogManager. */
type DialogBorder = "single" | "double" | "rounded" | "heavy" | "ascii" | "none" | "dashed";

/** Minimal engine shape required by the dialog tree runner. */
export interface DialogEngine {
  dialog: {
    show(text: string, opts?: Record<string, unknown>): Promise<void>;
    choice(text: string, choices: string[], opts?: Record<string, unknown>): Promise<number>;
  };
}

/** Runtime context available to dialog callbacks. */
export interface DialogContext {
  /** Arbitrary flags/state for the dialog (quest flags, npc mood, etc.). */
  flags: Record<string, unknown>;
  /** Engine reference for side effects. */
  engine: DialogEngine;
  /** Set a flag. */
  setFlag(key: string, value: unknown): void;
  /** Get a flag value (or default). */
  getFlag<T = unknown>(key: string, defaultValue?: T): T;
  /** Jump to a specific node by ID. Takes effect after the current callback returns. */
  goto(nodeId: string): void;
}

/** A single choice in a branching dialog node. */
export interface DialogChoice {
  /** Button text. */
  text: string;
  /** Next node ID. null = end dialog. */
  next: string | null;
  /** Optional condition — if returns false, choice is hidden. */
  condition?: (ctx: DialogContext) => boolean;
  /** Action to run when chosen (before transitioning). */
  action?: (ctx: DialogContext) => void;
}

/** A node in a dialog tree. */
export interface DialogNode {
  /** Unique ID within the tree. Used for goto references. */
  id: string;
  /** Who's speaking. */
  speaker?: string;
  /** Text content (supports styled text tags from @engine). */
  text: string;
  /** Typewriter speed (chars/sec). 0 = instant. Default 40. */
  typeSpeed?: number;
  /** Optional border style. */
  border?: DialogBorder;
  /** Choices for branching. If provided, shown after text completes. */
  choices?: DialogChoice[];
  /** Next node ID if no choices (linear dialog). null = end. */
  next?: string | null;
  /** Called when this node is shown. */
  onEnter?: (ctx: DialogContext) => void;
  /** Called when this node exits (before transitioning). */
  onExit?: (ctx: DialogContext) => void;
  /** Condition gate — if returns false, skip this node to `next`. */
  condition?: (ctx: DialogContext) => boolean;
}

/** The full dialog tree. */
export interface DialogTree {
  /** Starting node ID. */
  start: string;
  /** All nodes keyed by ID. */
  nodes: Record<string, DialogNode>;
}

// ── Runner ─────────────────────────────────────────────────────────

/** Upper bound on how many times the runner may visit the same node. */
const LOOP_GUARD_LIMIT = 100;

/**
 * Run a dialog tree. Returns a Promise that resolves when the dialog ends
 * (either a node has `next: null`, a choice picks `next: null`, or a node
 * is missing from the tree). The returned object is the final flags state,
 * useful for persisting dialog outcomes.
 *
 * Uses `engine.dialog.show()` for linear nodes and `engine.dialog.choice()`
 * for branching nodes under the hood.
 */
export async function runDialogTree(
  engine: DialogEngine,
  tree: DialogTree,
  initialFlags?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const flags: Record<string, unknown> = { ...(initialFlags ?? {}) };

  // gotoTarget is set by ctx.goto() from inside a callback. When non-null,
  // it overrides the normal next-node resolution for the current transition.
  let gotoTarget: string | null | undefined;

  const ctx: DialogContext = {
    flags,
    engine,
    setFlag(key, value) {
      flags[key] = value;
    },
    getFlag<T = unknown>(key: string, defaultValue?: T): T {
      return (key in flags ? flags[key] : (defaultValue as T)) as T;
    },
    goto(nodeId: string) {
      gotoTarget = nodeId;
    },
  };

  // Loop-guard tracking: count visits per node. If we visit any node more than
  // LOOP_GUARD_LIMIT times, assume an infinite loop and bail.
  const visitCounts: Record<string, number> = {};

  let currentId: string | null = tree.start;

  while (currentId !== null && currentId !== undefined) {
    const node: DialogNode | undefined = tree.nodes[currentId];
    if (!node) {
      // Unknown node — warn and end.
      console.warn(`[dialog-tree] unknown node id "${currentId}" — ending dialog`);
      break;
    }

    // Loop guard: bail if we've visited this node too many times.
    const count = (visitCounts[currentId] ?? 0) + 1;
    visitCounts[currentId] = count;
    if (count > LOOP_GUARD_LIMIT) {
      console.warn(
        `[dialog-tree] possible infinite loop at node "${currentId}" (visited ${count} times) — ending dialog`,
      );
      break;
    }

    // Condition gate: skip node if condition returns false.
    if (node.condition && !node.condition(ctx)) {
      currentId = node.next ?? null;
      continue;
    }

    // Clear any stale goto from prior iterations.
    gotoTarget = undefined;

    // onEnter callback
    if (node.onEnter) {
      node.onEnter(ctx);
    }

    // If onEnter called goto(), jump immediately (still run onExit).
    if (gotoTarget !== undefined) {
      if (node.onExit) node.onExit(ctx);
      currentId = gotoTarget;
      continue;
    }

    const visibleChoices = (node.choices ?? []).filter((c) => !c.condition || c.condition(ctx));

    const opts = {
      speaker: node.speaker,
      typeSpeed: node.typeSpeed ?? 40,
      border: node.border ?? "double",
    };

    let nextId: string | null;

    if (visibleChoices.length > 0) {
      // Branching node — await a choice.
      const idx = await engine.dialog.choice(
        node.text,
        visibleChoices.map((c) => c.text),
        opts,
      );

      const picked = visibleChoices[idx] ?? visibleChoices[0];

      // Run the choice's action first (may call goto()).
      if (picked.action) {
        picked.action(ctx);
      }

      nextId = picked.next ?? null;
    } else {
      // Linear node — await the message.
      await engine.dialog.show(node.text, opts);
      nextId = node.next ?? null;
    }

    // onExit callback (may also call goto()).
    if (node.onExit) {
      node.onExit(ctx);
    }

    // If anything called goto() during this node, it overrides nextId.
    if (gotoTarget !== undefined) {
      currentId = gotoTarget;
    } else {
      currentId = nextId;
    }
  }

  return flags;
}
