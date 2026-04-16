import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { events } from "../../../shared/events";
import { Viewport } from "../../render/viewport";

interface Listener {
  type: string;
  handler: (e: unknown) => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalGetComputedStyle = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;

let listeners: Listener[] = [];
let innerWidth = 800;
let innerHeight = 600;

function fire(type: string): void {
  for (const l of listeners) if (l.type === type) l.handler({});
}

beforeEach(() => {
  listeners = [];
  innerWidth = 800;
  innerHeight = 600;
  (globalThis as unknown as { window: unknown }).window = {
    get innerWidth() {
      return innerWidth;
    },
    get innerHeight() {
      return innerHeight;
    },
    addEventListener: (type: string, handler: (e: unknown) => void) =>
      listeners.push({ type, handler }),
    removeEventListener: (type: string, handler: (e: unknown) => void) => {
      const i = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ style: {}, remove: () => {} }),
    body: { appendChild: () => {} },
  };
  (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({
    paddingTop: "12px",
    paddingRight: "0px",
    paddingBottom: "34px",
    paddingLeft: "0px",
  });
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = originalGetComputedStyle;
});

describe("Viewport", () => {
  test("reads initial width/height/orientation/safeArea", () => {
    const vp = new Viewport();
    expect(vp.width).toBe(800);
    expect(vp.height).toBe(600);
    expect(vp.orientation).toBe("landscape");
    expect(vp.safeArea.top).toBe(12);
    expect(vp.safeArea.bottom).toBe(34);
    vp.destroy();
  });

  test("flips orientation on resize and emits events", () => {
    const vp = new Viewport();
    const resized: unknown[] = [];
    const flipped: unknown[] = [];
    const r = (e: unknown) => resized.push(e);
    const f = (e: unknown) => flipped.push(e);
    events.on("viewport:resized", r);
    events.on("viewport:orientation", f);

    innerWidth = 400;
    innerHeight = 800;
    fire("resize");
    expect(vp.orientation).toBe("portrait");
    expect(resized.length).toBe(1);
    expect(flipped.length).toBe(1);

    events.off("viewport:resized", r);
    events.off("viewport:orientation", f);
    vp.destroy();
  });

  test("does not emit orientation event when only size changes without flip", () => {
    const vp = new Viewport();
    const flipped: unknown[] = [];
    const f = (e: unknown) => flipped.push(e);
    events.on("viewport:orientation", f);

    innerWidth = 1200;
    fire("resize");
    expect(vp.orientation).toBe("landscape");
    expect(flipped.length).toBe(0);

    events.off("viewport:orientation", f);
    vp.destroy();
  });
});
