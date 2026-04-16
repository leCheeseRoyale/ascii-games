import { beforeEach, describe, expect, test } from "bun:test";
import { defineScene, SceneManager } from "../../core/scene";
import { mockEngine } from "../helpers";

describe("SceneManager", () => {
  let sm: SceneManager;
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    sm = new SceneManager();
    engine = mockEngine();
  });

  describe("register", () => {
    test("registers a scene", () => {
      const scene = defineScene({
        name: "title",
        setup: () => {},
      });
      sm.register(scene);
      // Can load it without error
      expect(sm.load("title", engine as any)).resolves.toBeUndefined();
    });

    test("can register multiple scenes", () => {
      sm.register(defineScene({ name: "a", setup: () => {} }));
      sm.register(defineScene({ name: "b", setup: () => {} }));
      expect(sm.load("a", engine as any)).resolves.toBeUndefined();
      expect(sm.load("b", engine as any)).resolves.toBeUndefined();
    });
  });

  describe("load", () => {
    test("calls setup on the scene", async () => {
      let setupCalled = false;
      sm.register(
        defineScene({
          name: "test",
          setup: () => {
            setupCalled = true;
          },
        }),
      );
      await sm.load("test", engine as any);
      expect(setupCalled).toBe(true);
    });

    test("sets current scene", async () => {
      const scene = defineScene({ name: "play", setup: () => {} });
      sm.register(scene);
      await sm.load("play", engine as any);
      expect(sm.current).toBe(scene);
    });

    test("throws for unknown scene name", async () => {
      sm.register(defineScene({ name: "real", setup: () => {} }));
      try {
        await sm.load("fake", engine as any);
        expect(true).toBe(false); // should not reach
      } catch (e: any) {
        expect(e.message).toContain("fake");
        expect(e.message).toContain("not found");
      }
    });

    test("error message lists available scenes", async () => {
      sm.register(defineScene({ name: "alpha", setup: () => {} }));
      sm.register(defineScene({ name: "beta", setup: () => {} }));
      try {
        await sm.load("gamma", engine as any);
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("alpha");
        expect(e.message).toContain("beta");
      }
    });

    test("calls cleanup on previous scene", async () => {
      let cleanedUp = false;
      sm.register(
        defineScene({
          name: "old",
          setup: () => {},
          cleanup: () => {
            cleanedUp = true;
          },
        }),
      );
      sm.register(defineScene({ name: "new", setup: () => {} }));

      await sm.load("old", engine as any);
      expect(cleanedUp).toBe(false);

      await sm.load("new", engine as any);
      expect(cleanedUp).toBe(true);
    });

    test("clears world when loading new scene", async () => {
      sm.register(defineScene({ name: "a", setup: () => {} }));
      sm.register(defineScene({ name: "b", setup: () => {} }));

      await sm.load("a", engine as any);
      engine.spawn({ position: { x: 0, y: 0 } });

      await sm.load("b", engine as any);
      // World should have been cleared
      const entities = [...engine.world.entities];
      expect(entities).toHaveLength(0);
    });
  });

  describe("update", () => {
    test("delegates to current scene update", async () => {
      let updateCalled = false;
      sm.register(
        defineScene({
          name: "play",
          setup: () => {},
          update: () => {
            updateCalled = true;
          },
        }),
      );
      await sm.load("play", engine as any);

      sm.update(engine as any, 0.016);
      expect(updateCalled).toBe(true);
    });

    test("passes engine and dt to scene update", async () => {
      let receivedArgs: any[] = [];
      sm.register(
        defineScene({
          name: "play",
          setup: () => {},
          update: (e, dt) => {
            receivedArgs = [e, dt];
          },
        }),
      );
      await sm.load("play", engine as any);

      sm.update(engine as any, 0.033);
      expect(receivedArgs[0]).toBe(engine);
      expect(receivedArgs[1]).toBe(0.033);
    });

    test("does nothing if no scene is loaded", () => {
      // Should not throw
      sm.update(engine as any, 0.016);
    });

    test("does nothing if scene has no update", async () => {
      sm.register(defineScene({ name: "static", setup: () => {} }));
      await sm.load("static", engine as any);
      // Should not throw
      sm.update(engine as any, 0.016);
    });
  });
});

describe("defineScene", () => {
  test("returns the same scene object", () => {
    const scene = { name: "test", setup: () => {} };
    expect(defineScene(scene)).toBe(scene);
  });
});
