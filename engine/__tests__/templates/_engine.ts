/**
 * Template smoke-test harness.
 *
 * Re-exports mockEngine as createTestEngine — both use the real Engine
 * in headless mode. Kept as an alias so template tests can use a
 * semantically distinct name.
 */

import { mockEngine } from "../helpers";

/**
 * Create a headless Engine for template smoke tests.
 * - No canvas/DOM/audio (headless mode).
 * - Audio is stubbed at setup.ts preload.
 * - Keyboard/mouse are inert — no input events are injected.
 */
export function createTestEngine(opts: { width?: number; height?: number } = {}) {
  return mockEngine(opts);
}
