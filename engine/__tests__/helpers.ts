/**
 * Shared test helpers — mock engine factory for system tests.
 */
import { createWorld } from "../ecs/world";

export function mockEngine(opts?: { width?: number; height?: number }) {
  const world = createWorld();
  const destroyed: any[] = [];

  return {
    world,
    width: opts?.width ?? 800,
    height: opts?.height ?? 600,
    spawn(data: Record<string, any>) {
      return world.add(data as any);
    },
    destroy(entity: any) {
      world.remove(entity);
      destroyed.push(entity);
    },
    _destroyed: destroyed,
    turns: { active: false, currentPhase: null as string | null },
    systems: {
      clear(_engine: any) {},
    },
    debug: {
      showError(_msg: string, _dur?: number) {},
    },
  };
}
