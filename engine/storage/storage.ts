/**
 * Persistent storage for game data.
 * Uses localStorage with a game-scoped key prefix.
 */

import { compressToUTF16, decompressFromUTF16 } from "lz-string";

let prefix = "ascii-game";

/** Set the storage key prefix. Call once at game init with your game name. */
export function setStoragePrefix(gameId: string): void {
  prefix = gameId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function key(name: string): string {
  return `${prefix}:${name}`;
}

/** Save a value to persistent storage. */
export function save(name: string, data: unknown): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

function safeReviver(key: string, value: unknown): unknown {
  if (key === "__proto__" || key === "constructor") return undefined;
  return value;
}

/** Load a value from persistent storage. Returns undefined if not found. */
export function load<T = unknown>(name: string): T | undefined {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return undefined;
    return JSON.parse(raw, safeReviver) as T;
  } catch {
    return undefined;
  }
}

/** Remove a value from persistent storage. */
export function remove(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    // fail silently
  }
}

/** Clear all storage for this game (only keys with matching prefix). */
export function clearAll(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${prefix}:`)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // fail silently
  }
}

/** Check if a key exists in persistent storage. */
export function has(name: string): boolean {
  try {
    return localStorage.getItem(key(name)) !== null;
  } catch {
    return false;
  }
}

/**
 * Save a value to persistent storage with lz-string UTF-16 compression.
 * Use `loadCompressed` to read back. Produces smaller localStorage entries
 * for large payloads (inventories, map data, replay buffers, etc.).
 */
export function saveCompressed<T>(name: string, data: T): void {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(key(name), compressToUTF16(json));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

/**
 * Load a compressed value from persistent storage. Handles migration
 * gracefully: if the stored value isn't compressed (e.g. saved with `save()`
 * before compression was enabled), falls back to raw `JSON.parse`.
 * Returns `undefined` if not found or unreadable.
 */
export function loadCompressed<T = unknown>(name: string): T | undefined {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return undefined;
    // Try decompression first (the expected path for compressed data).
    try {
      const decompressed = decompressFromUTF16(raw);
      if (decompressed) return JSON.parse(decompressed) as T;
    } catch {
      /* not compressed — fall through to raw parse */
    }
    // Fallback: raw JSON (uncompressed legacy data).
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}
