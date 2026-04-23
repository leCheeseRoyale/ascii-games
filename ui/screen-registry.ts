/**
 * Screen registry — maps screen names to React components.
 *
 * Games can call registerScreen() to add or override screens.
 * Default screens (menu, playing, paused, gameOver) are registered in defaults.ts.
 */

import type { ComponentType } from "react";

type ScreenRegistry = Map<string, ComponentType>;

const registry: ScreenRegistry = new Map();

export function registerScreen(name: string, component: ComponentType): void {
  registry.set(name, component);
}

export function getScreen(name: string): ComponentType | undefined {
  return registry.get(name);
}
