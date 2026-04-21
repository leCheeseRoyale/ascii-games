/**
 * Shared test helpers — headless engine factory for system tests.
 *
 * Uses the real Engine in headless mode (no canvas). All ECS, physics,
 * systems, timers, scene management, and game logic work; rendering is
 * a no-op. Tests call `engine.tick(dt)` to advance frames.
 */
import { Engine } from "../core/engine";

export function mockEngine(opts?: { width?: number; height?: number }): Engine {
  return new Engine(null, {
    headlessWidth: opts?.width ?? 800,
    headlessHeight: opts?.height ?? 600,
  });
}
