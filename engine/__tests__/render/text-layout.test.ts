import { describe, expect, test } from "bun:test";
import {
  clearTextCache,
  insertSoftHyphens,
  parseStyledText,
  stripTags,
} from "../../render/text-layout";

const BASE_FONT = "16px monospace";
const BASE_COLOR = "#fff";

describe("parseStyledText", () => {
  test("plain text has a single segment", () => {
    const segs = parseStyledText("hello", BASE_FONT, BASE_COLOR);
    expect(segs.length).toBe(1);
    expect(segs[0].text).toBe("hello");
    expect(segs[0].color).toBe(BASE_COLOR);
  });

  test("parses color tag", () => {
    const segs = parseStyledText("[#ff0000]red[/]", BASE_FONT, BASE_COLOR);
    const colored = segs.find((s) => s.color === "#ff0000");
    expect(colored).toBeDefined();
    expect(colored?.text).toBe("red");
  });

  test("parses bold tag", () => {
    const segs = parseStyledText("[b]bold[/b]", BASE_FONT, BASE_COLOR);
    const bold = segs.find((s) => s.text === "bold");
    expect(bold).toBeDefined();
    expect(bold?.font).toContain("bold");
  });

  test("parses dim tag", () => {
    const segs = parseStyledText("[dim]faded[/dim]", BASE_FONT, BASE_COLOR);
    const dim = segs.find((s) => s.text === "faded");
    expect(dim).toBeDefined();
    expect(dim?.opacity).toBeLessThan(1);
  });

  test("parses bg tag", () => {
    const segs = parseStyledText("[bg:#222]bg[/bg]", BASE_FONT, BASE_COLOR);
    const withBg = segs.find((s) => s.text === "bg");
    expect(withBg).toBeDefined();
    expect(withBg?.bgColor).toBe("#222");
  });

  test("handles surrounding plain text", () => {
    const segs = parseStyledText("before [#0f0]green[/] after", BASE_FONT, BASE_COLOR);
    const texts = segs.map((s) => s.text).join("");
    expect(texts).toBe("before green after");
  });

  test("handles nested tags", () => {
    const segs = parseStyledText("[b][#f00]bold red[/][/b]", BASE_FONT, BASE_COLOR);
    const match = segs.find((s) => s.text === "bold red");
    expect(match).toBeDefined();
    expect(match?.color).toBe("#f00");
    expect(match?.font).toContain("bold");
  });
});

describe("stripTags", () => {
  test("removes color tags", () => {
    expect(stripTags("[#ff0]yellow[/]")).toBe("yellow");
  });

  test("removes multiple tag types", () => {
    expect(stripTags("[b]bold[/b] and [dim]dim[/dim]")).toBe("bold and dim");
  });

  test("preserves plain text untouched", () => {
    expect(stripTags("plain text")).toBe("plain text");
  });

  test("preserves surrounding whitespace and punctuation", () => {
    expect(stripTags("Hello, [#f00]world[/]!")).toBe("Hello, world!");
  });
});

/**
 * The ascii-renderer builds a char-index → StyledSegment map by concatenating
 * segment text lengths and matching them against plainText (stripTags output).
 * If total segment length ever diverges from plain text length, the rendered
 * characters misalign with their colors. These tests lock down the invariant.
 */
describe("parseStyledText ↔ stripTags char-count invariant", () => {
  const cases = [
    "hello world",
    "[#ff0]yellow[/]",
    "[b]bold[/b] plain [dim]faded[/dim]",
    "before [#0f0]green[/] after",
    "[b][#f00]bold red[/][/b]",
    "prefix [bg:#222]bg[/bg] suffix",
    "nested [b]a[#f00]b[/]c[/b] end",
    // Unknown/unmatched tags should fall through as literal text.
    "keep [unknown] as-is",
  ];
  for (const raw of cases) {
    test(`length matches: ${raw}`, () => {
      const segs = parseStyledText(raw, BASE_FONT, BASE_COLOR);
      const segLen = segs.reduce((sum, s) => sum + s.text.length, 0);
      expect(segLen).toBe(stripTags(raw).length);
    });
  }

  test("char mapping resolves to the correct segment for each index", () => {
    const raw = "[#0f0]A[/][b]B[/b][#f00]C[/]";
    const segs = parseStyledText(raw, BASE_FONT, BASE_COLOR);
    const plain = stripTags(raw);
    expect(plain).toBe("ABC");
    // Replicate the renderer's mapping logic and assert per-char correctness.
    const plainChars = plain.length;
    const charStyles = new Array(plainChars);
    let i = 0;
    for (const seg of segs) {
      for (let ci = 0; ci < seg.text.length && i < plainChars; ci++) {
        charStyles[i++] = seg;
      }
    }
    expect(charStyles[0].color).toBe("#0f0");
    expect(charStyles[1].font).toContain("bold");
    expect(charStyles[2].color).toBe("#f00");
  });
});

describe("insertSoftHyphens", () => {
  test("inserts soft hyphens into long words", () => {
    const result = insertSoftHyphens("supercalifragilisticexpialidocious", 8);
    expect(result).toContain("\u00AD");
  });

  test("leaves short words untouched", () => {
    const result = insertSoftHyphens("hello world", 8);
    expect(result).toBe("hello world");
  });

  test("handles URLs with zero-width spaces", () => {
    const result = insertSoftHyphens("visit https://example.com/very/long/path", 8);
    // URLs should have some break opportunity inserted (zero-width space or soft hyphen)
    const hasBreak = result.includes("\u200B") || result.includes("\u00AD");
    expect(hasBreak).toBe(true);
  });
});

describe("clearTextCache", () => {
  test("runs without error", () => {
    expect(() => clearTextCache()).not.toThrow();
  });
});
