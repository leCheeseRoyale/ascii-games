import { describe, expect, it } from "bun:test";
import { Transition } from "../../render/transitions";

describe("Transition", () => {
  it("completes synchronous midpoint immediately", () => {
    const t = new Transition("fade", 0.5);
    let called = false;
    t.start(() => {
      called = true;
    });
    t.update(0.5);
    expect(called).toBe(true);
    expect(t.phase).toBe("in");
    t.update(0.5);
    expect(t.active).toBe(false);
  });

  it("waits for async midpoint promise", async () => {
    const t = new Transition("fade", 0.5);
    let resolveMidpoint: () => void = () => {};
    t.start(() => new Promise<void>((r) => (resolveMidpoint = r)));
    t.update(0.5);
    expect(t.phase).toBe("out");
    resolveMidpoint();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.phase).toBe("in");
  });

  it("forces phase=in when midpoint exceeds timeout", async () => {
    const t = new Transition("fade", 0.5, 10);
    t.start(() => new Promise<void>(() => {})); // never resolves
    t.update(0.5);
    expect(t.phase).toBe("out");
    await new Promise((r) => setTimeout(r, 30));
    expect(t.phase).toBe("in");
  });

  it("recovers when midpoint promise rejects", async () => {
    const t = new Transition("fade", 0.5, 50);
    t.start(() => Promise.reject(new Error("boom")));
    t.update(0.5);
    await new Promise((r) => setTimeout(r, 100));
    expect(t.phase).toBe("in");
  });
});
