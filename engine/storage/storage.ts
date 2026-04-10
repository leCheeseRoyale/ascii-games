/**
 * Persistent storage for game data.
 * Uses localStorage with a game-scoped key prefix.
 */

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

/** Load a value from persistent storage. Returns undefined if not found. */
export function load<T = unknown>(name: string): T | undefined {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
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
