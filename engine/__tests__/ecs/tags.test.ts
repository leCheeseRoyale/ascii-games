import { describe, expect, test } from "bun:test";
import { createTags } from "../../ecs/tags";

describe("createTags", () => {
  test("round-trips names into a Tags component", () => {
    const tags = createTags("player", "hero");
    expect(tags.values.has("player")).toBe(true);
    expect(tags.values.has("hero")).toBe(true);
    expect(tags.values.size).toBe(2);
  });
});
