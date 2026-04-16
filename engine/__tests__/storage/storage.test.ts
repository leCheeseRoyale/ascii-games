import { beforeEach, describe, expect, test } from "bun:test";
import { clearAll, has, load, remove, save, setStoragePrefix } from "../../storage/storage";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset prefix to default
    setStoragePrefix("ascii-game");
  });

  describe("save/load round-trip", () => {
    test("saves and loads a simple value", () => {
      save("score", 42);
      expect(load<number>("score")).toBe(42);
    });

    test("saves and loads an object", () => {
      const data = { level: 3, items: ["sword", "shield"] };
      save("checkpoint", data);
      expect(load<typeof data>("checkpoint")).toEqual(data);
    });

    test("saves and loads a string", () => {
      save("name", "player1");
      expect(load<string>("name")).toBe("player1");
    });

    test("saves and loads null", () => {
      save("empty", null);
      expect(load("empty")).toBeNull();
    });

    test("saves and loads boolean", () => {
      save("flag", true);
      expect(load<boolean>("flag")).toBe(true);
    });

    test("overwrites previous value", () => {
      save("val", 1);
      save("val", 2);
      expect(load<number>("val")).toBe(2);
    });
  });

  describe("load", () => {
    test("returns undefined for non-existent key", () => {
      expect(load("nonexistent")).toBeUndefined();
    });
  });

  describe("remove", () => {
    test("removes a saved value", () => {
      save("key1", "value1");
      remove("key1");
      expect(load("key1")).toBeUndefined();
    });

    test("removing non-existent key does not throw", () => {
      expect(() => remove("nope")).not.toThrow();
    });
  });

  describe("has", () => {
    test("returns true for existing key", () => {
      save("exists", 1);
      expect(has("exists")).toBe(true);
    });

    test("returns false for non-existent key", () => {
      expect(has("nope")).toBe(false);
    });

    test("returns false after remove", () => {
      save("temp", 1);
      remove("temp");
      expect(has("temp")).toBe(false);
    });
  });

  describe("clearAll (prefix-scoped)", () => {
    test("clears all keys with current prefix", () => {
      save("a", 1);
      save("b", 2);
      save("c", 3);
      clearAll();
      expect(load("a")).toBeUndefined();
      expect(load("b")).toBeUndefined();
      expect(load("c")).toBeUndefined();
    });

    test("does not clear keys from other prefixes", () => {
      // Save with default prefix
      save("shared", "default");

      // Switch prefix and save
      setStoragePrefix("other-game");
      save("shared", "other");

      // Clear only other-game keys
      clearAll();
      expect(load("shared")).toBeUndefined();

      // Switch back — original should still be there
      setStoragePrefix("ascii-game");
      expect(load<string>("shared")).toBe("default");
    });
  });

  describe("setStoragePrefix", () => {
    test("scopes keys to prefix", () => {
      setStoragePrefix("game-a");
      save("score", 100);

      setStoragePrefix("game-b");
      save("score", 200);

      setStoragePrefix("game-a");
      expect(load<number>("score")).toBe(100);

      setStoragePrefix("game-b");
      expect(load<number>("score")).toBe(200);
    });

    test("sanitizes prefix characters", () => {
      setStoragePrefix("my game!@#");
      save("test", 1);
      expect(load<number>("test")).toBe(1);
    });
  });
});
