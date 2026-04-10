/**
 * HUD component registry — controls which components render in the HUD bar.
 *
 * Default components (Score, HealthBar) are registered in defaults.ts.
 * Games can call setHUDComponents() to replace them entirely,
 * or registerHUDComponent() to append.
 */

import type { ComponentType } from "react";

let hudComponents: ComponentType[] = [];

export function registerHUDComponent(component: ComponentType): void {
  hudComponents.push(component);
}

export function setHUDComponents(components: ComponentType[]): void {
  hudComponents = components;
}

export function getHUDComponents(): ComponentType[] {
  return hudComponents;
}
