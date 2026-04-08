/**
 * Scene: a discrete game state (title screen, gameplay, game over).
 *
 * Each scene has setup/cleanup lifecycle hooks and an optional per-frame update.
 * The SceneManager handles transitions.
 */

import type { Engine } from "./engine";

export interface Scene {
  name: string;
  /** Called once when the scene starts. Spawn entities, add systems. */
  setup: (engine: Engine) => void | Promise<void>;
  /** Optional per-frame update (runs after systems). */
  update?: (engine: Engine, dt: number) => void;
  /** Called when leaving this scene. Clean up. */
  cleanup?: (engine: Engine) => void;
}

export function defineScene(scene: Scene): Scene {
  return scene;
}

export class SceneManager {
  current: Scene | null = null;
  private scenes = new Map<string, Scene>();

  register(scene: Scene): void {
    this.scenes.set(scene.name, scene);
  }

  async load(name: string, engine: Engine): Promise<void> {
    // Cleanup current
    if (this.current) {
      this.current.cleanup?.(engine);
      engine.systems.clear(engine);
      engine.world.clear();
    }

    const scene = this.scenes.get(name);
    if (!scene)
      throw new Error(
        `Scene "${name}" not found. Registered: ${[...this.scenes.keys()].join(", ")}`,
      );

    this.current = scene;
    await scene.setup(engine);
  }

  update(engine: Engine, dt: number): void {
    this.current?.update?.(engine, dt);
  }
}
