import { describe, expect, test } from "bun:test";
import { type DialogContext, type DialogTree, runDialogTree } from "../../behaviors/dialog-tree";

// ── Mock dialog helpers ────────────────────────────────────────────
//
// These stand in for `engine.dialog.show()` and `engine.dialog.choice()`,
// resolving immediately (no typewriter, no input wait).

interface ShowCall {
  type: "show";
  text: string;
  speaker?: string;
}
interface ChoiceCall {
  type: "choice";
  text: string;
  choices: string[];
}
type DialogCall = ShowCall | ChoiceCall;

/**
 * Build a mock engine whose `dialog.show` resolves instantly and whose
 * `dialog.choice` returns a deterministic index (by default 0, or per-call
 * via `choiceIndices` array, or via a selector function keyed on the text).
 */
function mockDialogEngine(opts?: {
  choiceIndices?: number[];
  choiceSelector?: (text: string, choices: string[]) => number;
}) {
  const calls: DialogCall[] = [];
  const indices = [...(opts?.choiceIndices ?? [])];

  return {
    calls,
    dialog: {
      show(text: string, o?: { speaker?: string }): Promise<void> {
        calls.push({ type: "show", text, speaker: o?.speaker });
        return Promise.resolve();
      },
      choice(text: string, choices: string[], _o?: { speaker?: string }): Promise<number> {
        calls.push({ type: "choice", text, choices });
        if (opts?.choiceSelector) {
          return Promise.resolve(opts.choiceSelector(text, choices));
        }
        if (indices.length > 0) {
          return Promise.resolve(indices.shift() as number);
        }
        return Promise.resolve(0);
      },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("runDialogTree — linear flow", () => {
  test("flows through all linear nodes in order", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: { id: "a", text: "First", next: "b" },
        b: { id: "b", text: "Second", next: "c" },
        c: { id: "c", text: "Third", next: null },
      },
    };

    await runDialogTree(engine, tree);

    expect(engine.calls.length).toBe(3);
    expect((engine.calls[0] as ShowCall).text).toBe("First");
    expect((engine.calls[1] as ShowCall).text).toBe("Second");
    expect((engine.calls[2] as ShowCall).text).toBe("Third");
  });

  test("ends dialog when next is null", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: { id: "a", text: "Only", next: null },
      },
    };

    await runDialogTree(engine, tree);

    expect(engine.calls.length).toBe(1);
  });

  test("passes speaker to dialog.show", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: { id: "a", speaker: "Bob", text: "Hi", next: null },
      },
    };

    await runDialogTree(engine, tree);

    expect((engine.calls[0] as ShowCall).speaker).toBe("Bob");
  });

  test("returns the final flags state", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "Greet",
          onEnter: (ctx) => ctx.setFlag("greeted", true),
          next: null,
        },
      },
    };

    const flags = await runDialogTree(engine, tree, { score: 0 });

    expect(flags.greeted).toBe(true);
    expect(flags.score).toBe(0);
  });
});

describe("runDialogTree — branching choices", () => {
  test("choice index selects the next node", async () => {
    const engine = mockDialogEngine({ choiceIndices: [1] });
    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "Choose:",
          choices: [
            { text: "Left", next: "left" },
            { text: "Right", next: "right" },
          ],
        },
        left: { id: "left", text: "You went left", next: null },
        right: { id: "right", text: "You went right", next: null },
      },
    };

    await runDialogTree(engine, tree);

    // First call is the choice, second is the follow-up show.
    expect(engine.calls[0]?.type).toBe("choice");
    expect((engine.calls[1] as ShowCall).text).toBe("You went right");
  });

  test("choice with next: null ends the dialog", async () => {
    const engine = mockDialogEngine({ choiceIndices: [0] });
    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "Bye?",
          choices: [
            { text: "Yes", next: null },
            { text: "No", next: "more" },
          ],
        },
        more: { id: "more", text: "More stuff", next: null },
      },
    };

    await runDialogTree(engine, tree);

    expect(engine.calls.length).toBe(1);
    expect(engine.calls[0]?.type).toBe("choice");
  });
});

describe("runDialogTree — condition gating", () => {
  test("skips a node whose condition returns false", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "Gated",
          condition: (ctx) => ctx.getFlag<boolean>("allow", false),
          next: "b",
        },
        b: { id: "b", text: "Reached", next: null },
      },
    };

    await runDialogTree(engine, tree, { allow: false });

    expect(engine.calls.length).toBe(1);
    expect((engine.calls[0] as ShowCall).text).toBe("Reached");
  });

  test("runs a node whose condition returns true", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "Gated",
          condition: (ctx) => ctx.getFlag<boolean>("allow", false),
          next: "b",
        },
        b: { id: "b", text: "Reached", next: null },
      },
    };

    await runDialogTree(engine, tree, { allow: true });

    expect(engine.calls.length).toBe(2);
    expect((engine.calls[0] as ShowCall).text).toBe("Gated");
    expect((engine.calls[1] as ShowCall).text).toBe("Reached");
  });

  test("hides choices whose condition returns false", async () => {
    let seen: string[] = [];
    const engine = mockDialogEngine({
      choiceSelector: (_text, choices) => {
        seen = [...choices];
        return 0;
      },
    });

    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "Pick",
          choices: [
            { text: "Always", next: null },
            {
              text: "Secret",
              next: null,
              condition: (ctx) => ctx.getFlag<boolean>("unlocked", false),
            },
          ],
        },
      },
    };

    await runDialogTree(engine, tree, { unlocked: false });

    expect(seen).toEqual(["Always"]);
    expect(seen).not.toContain("Secret");
  });

  test("shows choice when its condition returns true", async () => {
    let seen: string[] = [];
    const engine = mockDialogEngine({
      choiceSelector: (_text, choices) => {
        seen = [...choices];
        return 0;
      },
    });

    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "Pick",
          choices: [
            { text: "Always", next: null },
            {
              text: "Secret",
              next: null,
              condition: (ctx) => ctx.getFlag<boolean>("unlocked", false),
            },
          ],
        },
      },
    };

    await runDialogTree(engine, tree, { unlocked: true });

    expect(seen).toContain("Secret");
  });
});

describe("runDialogTree — flags", () => {
  test("setFlag mutates the flags object accessible from later callbacks", async () => {
    const engine = mockDialogEngine();
    const seenInB: number[] = [];
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "Bump",
          onEnter: (ctx) => ctx.setFlag("n", 5),
          next: "b",
        },
        b: {
          id: "b",
          text: "Check",
          onEnter: (ctx) => seenInB.push(ctx.getFlag<number>("n", 0)),
          next: null,
        },
      },
    };

    const final = await runDialogTree(engine, tree);

    expect(seenInB).toEqual([5]);
    expect(final.n).toBe(5);
  });

  test("getFlag returns default when key missing", async () => {
    const engine = mockDialogEngine();
    let observed: string | undefined;
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "x",
          onEnter: (ctx) => {
            observed = ctx.getFlag<string>("missing", "fallback");
          },
          next: null,
        },
      },
    };

    await runDialogTree(engine, tree);

    expect(observed).toBe("fallback");
  });

  test("initialFlags are used as starting state", async () => {
    const engine = mockDialogEngine();
    let observed: number | undefined;
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "x",
          onEnter: (ctx) => {
            observed = ctx.getFlag<number>("gold", 0);
          },
          next: null,
        },
      },
    };

    await runDialogTree(engine, tree, { gold: 42 });

    expect(observed).toBe(42);
  });
});

describe("runDialogTree — callbacks", () => {
  test("onEnter and onExit fire in order across multiple nodes", async () => {
    const engine = mockDialogEngine();
    const events: string[] = [];
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "A",
          onEnter: () => events.push("enter:a"),
          onExit: () => events.push("exit:a"),
          next: "b",
        },
        b: {
          id: "b",
          text: "B",
          onEnter: () => events.push("enter:b"),
          onExit: () => events.push("exit:b"),
          next: null,
        },
      },
    };

    await runDialogTree(engine, tree);

    expect(events).toEqual(["enter:a", "exit:a", "enter:b", "exit:b"]);
  });

  test("onEnter fires before the dialog is shown", async () => {
    const order: string[] = [];
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "Hi",
          onEnter: () => order.push("enter"),
          next: null,
        },
      },
    };

    const engine = {
      dialog: {
        show: (_text: string): Promise<void> => {
          order.push("show");
          return Promise.resolve();
        },
        choice: (): Promise<number> => Promise.resolve(0),
      },
    };

    await runDialogTree(engine, tree);

    expect(order).toEqual(["enter", "show"]);
  });

  test("choice action fires when the choice is picked", async () => {
    const engine = mockDialogEngine({ choiceIndices: [1] });
    const actionsFired: string[] = [];
    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "?",
          choices: [
            {
              text: "A",
              next: null,
              action: () => actionsFired.push("A"),
            },
            {
              text: "B",
              next: null,
              action: () => actionsFired.push("B"),
            },
          ],
        },
      },
    };

    await runDialogTree(engine, tree);

    expect(actionsFired).toEqual(["B"]);
  });
});

describe("runDialogTree — goto()", () => {
  test("goto() from a choice action overrides the normal next", async () => {
    const engine = mockDialogEngine({ choiceIndices: [0] });
    const tree: DialogTree = {
      start: "ask",
      nodes: {
        ask: {
          id: "ask",
          text: "?",
          choices: [
            {
              text: "Jump",
              next: "normal",
              action: (ctx: DialogContext) => ctx.goto("redirected"),
            },
          ],
        },
        normal: { id: "normal", text: "normal", next: null },
        redirected: { id: "redirected", text: "redirected", next: null },
      },
    };

    await runDialogTree(engine, tree);

    // First call is the choice; second should be the redirected node's show.
    const second = engine.calls[1] as ShowCall;
    expect(second.text).toBe("redirected");
  });

  test("goto() from onExit overrides the normal next", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "A",
          onExit: (ctx) => ctx.goto("c"),
          next: "b",
        },
        b: { id: "b", text: "B", next: null },
        c: { id: "c", text: "C", next: null },
      },
    };

    await runDialogTree(engine, tree);

    expect(engine.calls.length).toBe(2);
    expect((engine.calls[1] as ShowCall).text).toBe("C");
  });

  test("goto() from onEnter skips the dialog and jumps immediately", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: {
          id: "a",
          text: "skipped",
          onEnter: (ctx) => ctx.goto("b"),
          next: null,
        },
        b: { id: "b", text: "jumped here", next: null },
      },
    };

    await runDialogTree(engine, tree);

    // A should NOT produce a show call (onEnter redirected before show).
    expect(engine.calls.length).toBe(1);
    expect((engine.calls[0] as ShowCall).text).toBe("jumped here");
  });
});

describe("runDialogTree — robustness", () => {
  test("ends gracefully when next points to a missing node", async () => {
    const engine = mockDialogEngine();
    const tree: DialogTree = {
      start: "a",
      nodes: {
        a: { id: "a", text: "x", next: "ghost" },
      },
    };

    // Should not throw, should end dialog cleanly.
    await runDialogTree(engine, tree);

    expect(engine.calls.length).toBe(1);
  });

  test("breaks out of infinite loops with a warning", async () => {
    const engine = mockDialogEngine();
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    try {
      // Self-loop: a -> a (skipped by condition but next points back to a).
      // Use a node whose condition always false and next pointing to itself,
      // which is the pathological infinite skip loop.
      const tree: DialogTree = {
        start: "a",
        nodes: {
          a: {
            id: "a",
            text: "loop",
            condition: () => false, // always skip
            next: "a", // loops forever
          },
        },
      };

      await runDialogTree(engine, tree);

      // Loop guard must have fired.
      expect(warnings.some((w) => w.includes("infinite loop"))).toBe(true);
      // No dialog calls made (condition skipped every time).
      expect(engine.calls.length).toBe(0);
    } finally {
      console.warn = origWarn;
    }
  });
});
