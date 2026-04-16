/**
 * Deterministic state hashing utilities.
 *
 * `stableStringify` produces a JSON string with object keys sorted
 * recursively, so two logically-equal objects always produce the same string
 * even if their keys were inserted in different orders.
 *
 * `fnv1a32` is a small 32-bit FNV-1a hash — fast, dependency-free, and
 * stable across engine versions. Together they let lockstep peers compare
 * post-turn state hashes for desync detection without serialization
 * surprises.
 */

/**
 * Stable JSON serializer — identical output for objects with the same
 * logical content regardless of key insertion order.
 *
 * - Arrays preserve order (they are ordered sequences by definition).
 * - Object keys are sorted alphabetically before serialization.
 * - `undefined`, functions, and symbols are omitted (same as JSON.stringify).
 * - Handles cycles by throwing — don't hash self-referential state.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return walk(value);

  function walk(v: unknown): string {
    if (v === null || typeof v !== "object") {
      // Primitives delegate to JSON.stringify which handles strings,
      // numbers, booleans, null, and the undefined → undefined case.
      return JSON.stringify(v);
    }
    if (seen.has(v as object)) {
      throw new Error("stableStringify: cyclic reference");
    }
    seen.add(v as object);

    if (Array.isArray(v)) {
      const parts = v.map((el) => {
        const s = walk(el);
        // JSON.stringify of undefined returns undefined — arrays serialize
        // missing slots as null to stay valid JSON, matching JSON.stringify.
        return s === undefined ? "null" : s;
      });
      return `[${parts.join(",")}]`;
    }

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const s = walk(obj[k]);
      if (s === undefined) continue; // drop undefined values like JSON.stringify
      parts.push(`${JSON.stringify(k)}:${s}`);
    }
    return `{${parts.join(",")}}`;
  }
}

/**
 * FNV-1a 32-bit hash over a string. Returns an unsigned 32-bit integer.
 *
 * Deterministic, dependency-free, and fast enough for per-turn hashing.
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Default state hash: stable-stringify then fnv1a32. Returns a hex string
 * so TurnSync's `submitStateHash` can compare by value equality trivially.
 */
export function defaultHashState(state: unknown): string {
  return fnv1a32(stableStringify(state)).toString(16).padStart(8, "0");
}
