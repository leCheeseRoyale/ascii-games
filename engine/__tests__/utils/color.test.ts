import { describe, expect, test } from "bun:test";
import { hsl, hsla, lerpColor, rainbow } from "../../utils/color";

describe("hsl", () => {
  test("returns a valid CSS hsl string", () => {
    expect(hsl(120, 80, 50)).toBe("hsl(120, 80%, 50%)");
  });

  test("handles zero values", () => {
    expect(hsl(0, 0, 0)).toBe("hsl(0, 0%, 0%)");
  });

  test("handles max values", () => {
    expect(hsl(360, 100, 100)).toBe("hsl(360, 100%, 100%)");
  });
});

describe("hsla", () => {
  test("returns a valid CSS hsla string", () => {
    expect(hsla(120, 80, 50, 0.5)).toBe("hsla(120, 80%, 50%, 0.5)");
  });

  test("handles alpha = 0", () => {
    expect(hsla(0, 0, 0, 0)).toBe("hsla(0, 0%, 0%, 0)");
  });

  test("handles alpha = 1", () => {
    expect(hsla(180, 50, 50, 1)).toBe("hsla(180, 50%, 50%, 1)");
  });
});

describe("lerpColor", () => {
  test("returns first color at t=0", () => {
    expect(lerpColor("#ff0000", "#0000ff", 0)).toBe("#ff0000");
  });

  test("returns second color at t=1", () => {
    expect(lerpColor("#ff0000", "#0000ff", 1)).toBe("#0000ff");
  });

  test("returns midpoint at t=0.5", () => {
    const mid = lerpColor("#000000", "#ffffff", 0.5);
    // Each channel: 0 + (255 - 0) * 0.5 = 127.5, rounded = 128 = 0x80
    expect(mid).toBe("#808080");
  });

  test("interpolates red to green", () => {
    const mid = lerpColor("#ff0000", "#00ff00", 0.5);
    // Red: 255 * 0.5 = 128 = 0x80, Green: 255 * 0.5 = 128 = 0x80
    expect(mid).toBe("#808000");
  });

  test("returns lowercase hex with proper padding", () => {
    const result = lerpColor("#000000", "#0a0b0c", 1);
    expect(result).toBe("#0a0b0c");
  });
});

describe("rainbow", () => {
  test("returns an hsl string", () => {
    const result = rainbow(0, 1);
    expect(result).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  test("cycles hue over time", () => {
    const c1 = rainbow(0, 1);
    const c2 = rainbow(0.5, 1);
    // At t=0, hue=0; at t=0.5, hue=180
    expect(c1).toBe("hsl(0, 80%, 60%)");
    expect(c2).toBe("hsl(180, 80%, 60%)");
  });

  test("speed multiplier affects hue", () => {
    const c1 = rainbow(0.25, 2);
    // hue = (0.25 * 2 * 360) % 360 = 180
    expect(c1).toBe("hsl(180, 80%, 60%)");
  });

  test("accepts custom saturation and lightness", () => {
    const result = rainbow(0, 1, 50, 40);
    expect(result).toBe("hsl(0, 50%, 40%)");
  });
});
