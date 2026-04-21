/**
 * Multi-slot save manager — metadata, listing, active-slot tracking, autosave.
 *
 * `SaveSlotManager` wraps the engine's existing `save` / `load` / `remove` /
 * `has` storage primitives with a higher-level abstraction that most games
 * want: multiple named save slots, rich metadata (name, timestamp, playtime,
 * scene, thumbnail), a sorted listing for UI, an optional "active slot"
 * concept for the current save, a reserved autosave slot, JSON export/import
 * for cloud sync, and a migration hook for version mismatches.
 *
 * The manager is fully opt-in and self-contained — it does not touch the
 * engine, events, or any game systems. Games that don't need multi-slot saves
 * can continue using `save()` / `load()` directly with zero cost.
 *
 * Storage keys under the configured prefix:
 *   - `${prefix}${slotId}`   — each slot's `SaveSlot<T>` payload
 *   - `${prefix}_index`      — list of slot IDs (excluding autosave)
 *   - `${prefix}_active`     — currently active slot id, or null
 *
 * @example
 * ```ts
 * import { SaveSlotManager } from '@engine';
 *
 * interface GameState {
 *   level: number;
 *   hp: number;
 *   inventory: string[];
 * }
 *
 * const saves = new SaveSlotManager<GameState>({
 *   maxSlots: 3,
 *   version: '1.2.0',
 *   onMigrate: (old) => {
 *     // migrate from older schema; return null to treat as unreadable
 *     if (old.metadata.version === '1.0.0') {
 *       return { ...old, data: { ...old.data, inventory: [] } };
 *     }
 *     return null;
 *   },
 * });
 *
 * saves.save('slot-1', { level: 3, hp: 50, inventory: ['sword'] }, {
 *   name: 'Forest Boss',
 *   sceneName: 'forest',
 *   playtime: 1234,
 *   thumbnail: canvas.toDataURL(),
 * });
 *
 * for (const meta of saves.list()) {
 *   console.log(meta.name, meta.timestamp);
 * }
 *
 * saves.setActive('slot-1');
 * const loaded = saves.loadActive();
 * ```
 */

import {
  has as hasStorage,
  load as loadStorage,
  loadCompressed as loadCompressedStorage,
  remove as removeStorage,
  save as saveStorage,
  saveCompressed as saveCompressedStorage,
} from "./index";

// ── Public types ────────────────────────────────────────────────

/** Metadata describing a save slot — lightweight info for UIs. */
export interface SaveSlotMetadata {
  /** Unique slot identifier. */
  slotId: string;
  /** User-facing name. Defaults to `"Slot N"`. */
  name: string;
  /** Milliseconds since epoch of the last write to this slot. */
  timestamp: number;
  /** Seconds of gameplay. Caller is responsible for tracking this. */
  playtime: number;
  /** Scene name at the time of save, for UI display. */
  sceneName?: string;
  /** Optional base64 PNG thumbnail (e.g. from `canvas.toDataURL()`). */
  thumbnail?: string;
  /** Game-specific extra fields (level, score, char name, etc.). */
  custom?: Record<string, any>;
  /** User-defined schema version, consulted by `onMigrate`. */
  version?: string;
}

/** A full save slot — metadata plus the game-defined data payload. */
export interface SaveSlot<T = unknown> {
  metadata: SaveSlotMetadata;
  data: T;
}

/** Options accepted by `SaveSlotManager`. */
export interface SaveSlotManagerOptions<T = unknown> {
  /** Maximum named slots. Default 5. Pass `Infinity` for unlimited. Autosave is NOT counted. */
  maxSlots?: number;
  /** Storage key prefix. Default `"save:"`. */
  prefix?: string;
  /** Current game schema version. Attached to metadata if the caller doesn't supply one. */
  version?: string;
  /**
   * Called when loaded slot metadata's `version` differs from the manager's
   * configured `version`. Return the migrated slot, or `null` to treat the
   * slot as corrupt / unreadable.
   */
  onMigrate?: (oldData: SaveSlot<any>) => SaveSlot<T> | null;
  /**
   * When true, slot data is lz-string compressed before writing to
   * localStorage. The slot index and active-slot tracker are kept
   * uncompressed for fast listing. Loading handles both compressed and
   * uncompressed data transparently, so enabling this on an existing game
   * won't break old saves. Default `false`.
   */
  compress?: boolean;
}

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_MAX_SLOTS = 5;
const DEFAULT_PREFIX = "save:";
const AUTOSAVE_SLOT_ID = "autosave";
const INDEX_KEY = "_index";
const ACTIVE_KEY = "_active";

// ── Implementation ──────────────────────────────────────────────

/** Multi-slot save manager. See module docs. */
export class SaveSlotManager<T = unknown> {
  private readonly maxSlots: number;
  private readonly prefix: string;
  private readonly version?: string;
  private readonly onMigrate?: (oldData: SaveSlot<any>) => SaveSlot<T> | null;
  private readonly compress: boolean;

  constructor(opts: SaveSlotManagerOptions<T> = {}) {
    this.maxSlots = opts.maxSlots ?? DEFAULT_MAX_SLOTS;
    this.prefix = opts.prefix ?? DEFAULT_PREFIX;
    this.version = opts.version;
    this.onMigrate = opts.onMigrate;
    this.compress = opts.compress ?? false;
  }

  // ── CRUD ───────────────────────────────────────────────────────

  /**
   * Save data to a slot. Overwrites any existing slot with the same id.
   * Throws if `maxSlots` is already reached and `slotId` is new.
   */
  save(slotId: string, data: T, meta: Partial<SaveSlotMetadata> = {}): SaveSlotMetadata {
    if (!slotId) {
      throw new Error("SaveSlotManager.save: slotId is required");
    }

    const isAutosave = slotId === AUTOSAVE_SLOT_ID;
    const index = this.readIndex();
    const isNew = !isAutosave && !index.includes(slotId);

    if (isNew && index.length >= this.maxSlots) {
      throw new Error(
        `SaveSlotManager.save: cannot create new slot "${slotId}" — maxSlots (${this.maxSlots}) reached. Delete an existing slot first.`,
      );
    }

    const defaultName = `Slot ${index.length + 1}`;
    const metadata: SaveSlotMetadata = {
      name: defaultName,
      playtime: 0,
      ...(this.version !== undefined ? { version: this.version } : {}),
      ...meta,
      slotId,
      timestamp: Date.now(),
    };

    const slot: SaveSlot<T> = { metadata, data };
    this.saveSlotData(slotId, slot);

    // Maintain the index. Autosave is excluded from the index so it never
    // counts toward `maxSlots` or appears in `list()`.
    if (isNew) {
      index.push(slotId);
      this.writeIndex(index);
    }

    return metadata;
  }

  /**
   * Load a slot. Returns `null` if the slot is missing, corrupt, or fails
   * migration.
   */
  load(slotId: string): SaveSlot<T> | null {
    const raw = this.loadSlotData(slotId);
    if (!raw) return null;
    if (!isValidSlot(raw)) return null;

    // Version check: if the caller configured a current version and the slot's
    // version differs, route through the migration hook. If no hook is
    // provided, the slot is loaded as-is (games may not care about versioning).
    if (
      this.version !== undefined &&
      raw.metadata.version !== undefined &&
      raw.metadata.version !== this.version &&
      this.onMigrate
    ) {
      try {
        const migrated = this.onMigrate(raw);
        if (migrated === null) return null;
        return migrated;
      } catch {
        return null;
      }
    }

    return raw as SaveSlot<T>;
  }

  /** Delete a slot. Returns true if the slot existed. Clears active if active matches. */
  delete(slotId: string): boolean {
    const existed = this.exists(slotId);
    if (!existed) return false;

    removeStorage(this.storageName(slotId));

    if (slotId !== AUTOSAVE_SLOT_ID) {
      const index = this.readIndex().filter((id) => id !== slotId);
      this.writeIndex(index);
    }

    if (this.getActive() === slotId) {
      this.setActive(null);
    }

    return true;
  }

  /** True if the slot currently has data in storage. */
  exists(slotId: string): boolean {
    return hasStorage(this.storageName(slotId));
  }

  /** Rename a slot. Returns true if the slot existed and was renamed. */
  rename(slotId: string, newName: string): boolean {
    const slot = this.load(slotId);
    if (!slot) return false;
    slot.metadata.name = newName;
    // Write the full slot back — bypassing save() so the timestamp stays put
    // and we don't re-validate maxSlots for an existing slot.
    this.saveSlotData(slotId, slot);
    return true;
  }

  // ── Bulk ───────────────────────────────────────────────────────

  /** List metadata for every named slot (excluding autosave), sorted by timestamp descending. */
  list(): SaveSlotMetadata[] {
    const index = this.readIndex();
    const out: SaveSlotMetadata[] = [];

    // Also prune index of any stale entries whose data has been removed
    // out-of-band (e.g. via direct storage clears).
    const liveIds: string[] = [];
    for (const slotId of index) {
      const slot = this.loadSlotData(slotId);
      if (slot && isValidSlot(slot)) {
        out.push(slot.metadata);
        liveIds.push(slotId);
      }
    }
    if (liveIds.length !== index.length) {
      this.writeIndex(liveIds);
    }

    out.sort((a, b) => b.timestamp - a.timestamp);
    return out;
  }

  /** Count of named slots (excluding autosave). */
  count(): number {
    return this.readIndex().length;
  }

  /** Delete every slot (including autosave) and clear the active tracker. */
  clear(): void {
    const index = this.readIndex();
    for (const slotId of index) {
      removeStorage(this.storageName(slotId));
    }
    removeStorage(this.storageName(AUTOSAVE_SLOT_ID));
    removeStorage(this.storageName(INDEX_KEY));
    removeStorage(this.storageName(ACTIVE_KEY));
  }

  /** True if the count of named slots equals `maxSlots`. */
  isFull(): boolean {
    return this.count() >= this.maxSlots;
  }

  // ── Active slot ────────────────────────────────────────────────

  /** Set the active slot id (or `null` to clear). */
  setActive(slotId: string | null): void {
    if (slotId === null) {
      removeStorage(this.storageName(ACTIVE_KEY));
    } else {
      saveStorage(this.storageName(ACTIVE_KEY), slotId);
    }
  }

  /** Get the active slot id, or `null` if none. */
  getActive(): string | null {
    const id = loadStorage<string>(this.storageName(ACTIVE_KEY));
    return id ?? null;
  }

  /** Save to the active slot. Returns `null` if no active slot is set. */
  saveActive(data: T, meta: Partial<SaveSlotMetadata> = {}): SaveSlotMetadata | null {
    const active = this.getActive();
    if (!active) return null;
    return this.save(active, data, meta);
  }

  /** Load the active slot. Returns `null` if no active slot or the slot is missing. */
  loadActive(): SaveSlot<T> | null {
    const active = this.getActive();
    if (!active) return null;
    return this.load(active);
  }

  // ── Autosave ───────────────────────────────────────────────────

  /** Save to the reserved autosave slot. Does NOT count toward `maxSlots`. */
  autosave(data: T, meta: Partial<SaveSlotMetadata> = {}): SaveSlotMetadata {
    return this.save(AUTOSAVE_SLOT_ID, data, { name: "Autosave", ...meta });
  }

  /** Load the autosave slot. Returns `null` if none exists. */
  loadAutosave(): SaveSlot<T> | null {
    return this.load(AUTOSAVE_SLOT_ID);
  }

  /** True if the autosave slot has data. */
  hasAutosave(): boolean {
    return this.exists(AUTOSAVE_SLOT_ID);
  }

  // ── Import / export ────────────────────────────────────────────

  /** Export a slot as a JSON string. Returns `null` if the slot is missing. */
  exportSlot(slotId: string): string | null {
    // Read raw data — don't route through `load()` so export reflects what's
    // on disk even if a migration would transform it on read.
    const raw = this.loadSlotData(slotId);
    if (!raw || !isValidSlot(raw)) return null;
    return JSON.stringify(raw);
  }

  /**
   * Import a JSON-encoded slot. Returns true on success. Enforces `maxSlots`
   * just like `save()`. Rejects malformed JSON and invalid shapes.
   */
  importSlot(slotId: string, json: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return false;
    }
    if (!isValidSlot(parsed)) return false;

    const slot = parsed as SaveSlot<T>;

    // Enforce maxSlots on new imports (autosave exempt).
    const isAutosave = slotId === AUTOSAVE_SLOT_ID;
    const index = this.readIndex();
    const isNew = !isAutosave && !index.includes(slotId);
    if (isNew && index.length >= this.maxSlots) {
      return false;
    }

    // Rewrite the slotId in metadata to match the import target.
    slot.metadata.slotId = slotId;

    this.saveSlotData(slotId, slot);
    if (isNew) {
      index.push(slotId);
      this.writeIndex(index);
    }
    return true;
  }

  // ── Internals ──────────────────────────────────────────────────

  private storageName(slotId: string): string {
    return `${this.prefix}${slotId}`;
  }

  /** Save slot data, using compression when enabled. */
  private saveSlotData(slotId: string, data: SaveSlot<T>): void {
    const name = this.storageName(slotId);
    if (this.compress) {
      saveCompressedStorage(name, data);
    } else {
      saveStorage(name, data);
    }
  }

  /**
   * Load slot data, using compressed loader when compression is enabled.
   * The compressed loader handles both compressed and uncompressed data,
   * so old saves still load after enabling compression.
   */
  private loadSlotData(slotId: string): SaveSlot<any> | undefined {
    const name = this.storageName(slotId);
    if (this.compress) {
      return loadCompressedStorage<SaveSlot<any>>(name);
    }
    return loadStorage<SaveSlot<any>>(name);
  }

  private readIndex(): string[] {
    // Index is always uncompressed for fast listing.
    const idx = loadStorage<string[]>(this.storageName(INDEX_KEY));
    return Array.isArray(idx) ? [...idx] : [];
  }

  private writeIndex(ids: string[]): void {
    // Index is always uncompressed.
    saveStorage(this.storageName(INDEX_KEY), ids);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/** Structural check for a `SaveSlot<T>` shape. */
function isValidSlot(v: unknown): v is SaveSlot<any> {
  if (!v || typeof v !== "object") return false;
  const slot = v as { metadata?: unknown; data?: unknown };
  if (!slot.metadata || typeof slot.metadata !== "object") return false;
  if (!("data" in slot)) return false;
  const meta = slot.metadata as Record<string, unknown>;
  if (typeof meta.slotId !== "string") return false;
  if (typeof meta.name !== "string") return false;
  if (typeof meta.timestamp !== "number") return false;
  if (typeof meta.playtime !== "number") return false;
  return true;
}
