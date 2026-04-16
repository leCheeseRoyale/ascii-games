import { beforeEach, describe, expect, test } from "bun:test";
import { stateMachineSystem, transition } from "../../ecs/state-machine-system";
import { mockEngine } from "../helpers";

describe("stateMachineSystem", () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine();
  });

  test("calls update on current state", () => {
    let updated = false;
    engine.spawn({
      stateMachine: {
        current: "idle",
        states: {
          idle: {
            update: () => {
              updated = true;
            },
          },
        },
      },
    });

    stateMachineSystem.update(engine as any, 0.016);
    expect(updated).toBe(true);
  });

  test("passes entity, engine, and dt to state update", () => {
    let receivedArgs: any[] = [];
    const entity = engine.spawn({
      stateMachine: {
        current: "idle",
        states: {
          idle: {
            update: (e: any, eng: any, dt: number) => {
              receivedArgs = [e, eng, dt];
            },
          },
        },
      },
    });

    stateMachineSystem.update(engine as any, 0.033);
    expect(receivedArgs[0]).toBe(entity);
    expect(receivedArgs[1]).toBe(engine);
    expect(receivedArgs[2]).toBe(0.033);
  });

  describe("transitions", () => {
    test("calls exit on old state and enter on new state", () => {
      const log: string[] = [];
      engine.spawn({
        stateMachine: {
          current: "idle",
          next: "running",
          states: {
            idle: {
              exit: () => log.push("exit:idle"),
            },
            running: {
              enter: () => log.push("enter:running"),
            },
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(log).toEqual(["exit:idle", "enter:running"]);
    });

    test("updates current state after transition", () => {
      const entity = engine.spawn({
        stateMachine: {
          current: "idle",
          next: "running",
          states: {
            idle: {},
            running: {},
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(entity.stateMachine.current).toBe("running");
    });

    test("clears next after transition", () => {
      const entity = engine.spawn({
        stateMachine: {
          current: "idle",
          next: "running",
          states: {
            idle: {},
            running: {},
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(entity.stateMachine.next).toBeUndefined();
    });

    test("runs new state update after transition", () => {
      let newStateUpdated = false;
      engine.spawn({
        stateMachine: {
          current: "idle",
          next: "running",
          states: {
            idle: {},
            running: {
              update: () => {
                newStateUpdated = true;
              },
            },
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(newStateUpdated).toBe(true);
    });

    test("does not transition when next equals current", () => {
      const log: string[] = [];
      engine.spawn({
        stateMachine: {
          current: "idle",
          next: "idle",
          states: {
            idle: {
              exit: () => log.push("exit"),
              enter: () => log.push("enter"),
            },
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(log).toEqual([]);
    });

    test("does not transition when next is undefined", () => {
      const log: string[] = [];
      engine.spawn({
        stateMachine: {
          current: "idle",
          states: {
            idle: {
              exit: () => log.push("exit"),
            },
          },
        },
      });

      stateMachineSystem.update(engine as any, 0.016);
      expect(log).toEqual([]);
    });
  });

  test("has correct system name", () => {
    expect(stateMachineSystem.name).toBe("_stateMachine");
  });
});

describe("transition helper", () => {
  test("sets next on entity stateMachine", () => {
    const entity = { stateMachine: { current: "idle", states: {} } } as any;
    transition(entity, "running");
    expect(entity.stateMachine.next).toBe("running");
  });

  test("does nothing if entity has no stateMachine", () => {
    const entity = {};
    expect(() => transition(entity, "running")).not.toThrow();
  });
});
