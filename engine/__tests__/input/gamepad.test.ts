/**
 * Tests for Gamepad — browser Gamepad API wrapper.
 *
 * Bun's test runtime has no real window/navigator gamepad support, so we
 * install minimal mocks on globalThis that the Gamepad class's listeners
 * and update() loop interact with.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Gamepad } from "../../input/gamepad";

interface Listener {
  type: string;
  handler: (e: unknown) => void;
}

let listeners: Listener[] = [];
let fakePads: Array<{
  buttons: Array<{ pressed: boolean; value: number }>;
  axes: number[];
} | null> = [];

const originalWindow = (globalThis as { window?: unknown }).window;
const originalNavigator = (globalThis as { navigator?: unknown }).navigator;

beforeEach(() => {
  listeners = [];
  fakePads = [];
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (type: string, handler: (e: unknown) => void) =>
      listeners.push({ type, handler }),
    removeEventListener: (type: string, handler: (e: unknown) => void) => {
      const i = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  (globalThis as unknown as { navigator: unknown }).navigator = { getGamepads: () => fakePads };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
});

function fire(type: string, e: unknown): void {
  for (const l of listeners) if (l.type === type) l.handler(e);
}

function makePad(buttons: boolean[], axes = [0, 0, 0, 0]) {
  return {
    buttons: buttons.map((pressed) => ({ pressed, value: pressed ? 1 : 0 })),
    axes,
  };
}

describe("Gamepad", () => {
  test("connects and reads button state", () => {
    const gp = new Gamepad();
    fakePads[0] = makePad([true, false]);
    fire("gamepadconnected", { gamepad: { index: 0 } });
    gp.update();
    expect(gp.connected).toBe(true);
    expect(gp.held(0)).toBe(true);
    expect(gp.held(1)).toBe(false);
  });

  test("clears button and axis state on disconnect", () => {
    const gp = new Gamepad();
    fakePads[0] = makePad([true, true], [0.8, -0.5, 0.3, 0]);
    fire("gamepadconnected", { gamepad: { index: 0 } });
    gp.update();
    expect(gp.held(0)).toBe(true);
    expect(gp.stick("left", 0).x).toBeCloseTo(0.8);

    fire("gamepaddisconnected", { gamepad: { index: 0 } });
    expect(gp.connected).toBe(false);
    expect(gp.held(0)).toBe(false);
    expect(gp.held(1)).toBe(false);
    expect(gp.stick("left", 0)).toEqual({ x: 0, y: 0 });
    expect(gp.stick("right", 0)).toEqual({ x: 0, y: 0 });
  });

  test("no ghost pressed() after reconnect", () => {
    const gp = new Gamepad();
    fakePads[0] = makePad([true]);
    fire("gamepadconnected", { gamepad: { index: 0 } });
    gp.update();
    fire("gamepaddisconnected", { gamepad: { index: 0 } });

    // Reconnect with no buttons pressed — pressed() must not fire.
    fakePads[0] = makePad([false]);
    fire("gamepadconnected", { gamepad: { index: 0 } });
    gp.update();
    expect(gp.pressed(0)).toBe(false);
    expect(gp.released(0)).toBe(false);
  });
});
