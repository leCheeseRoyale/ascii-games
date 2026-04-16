import type { Engine } from "../core/engine";
import { type System, SystemPriority } from "./systems";

export const stateMachineSystem: System = {
  name: "_stateMachine",
  priority: SystemPriority.stateMachine,
  update(engine: Engine, dt: number) {
    for (const entity of engine.world.with("stateMachine")) {
      const sm = entity.stateMachine;

      // Process transition if requested
      if (sm.next && sm.next !== sm.current) {
        const oldState = sm.states[sm.current];
        oldState?.exit?.(entity, engine);

        sm.current = sm.next;
        sm.next = undefined;

        const newState = sm.states[sm.current];
        newState?.enter?.(entity, engine);
      }

      // Run current state's update
      const state = sm.states[sm.current];
      state?.update?.(entity, engine, dt);
    }
  },
};

/** Trigger a state transition on an entity. Processed next frame by the system. */
export function transition(entity: { stateMachine?: { next?: string } }, state: string): void {
  if (entity.stateMachine) {
    entity.stateMachine.next = state;
  }
}
