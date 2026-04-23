# Engine API Reference (Auto-Generated)

> Generated from actual TypeScript declarations. Do not edit manually.
> Last generated: 2026-04-22

## Uncategorized

```ts
export { COLORS, FONTS, PALETTES } from "@shared/constants";
export { events } from "@shared/events";
export type { Acceleration, Animation, AnimationFrame, Ascii, CharTransform, Child, Collider, CollisionCallback, EngineConfig, Entity, GameEntity, GameTime, Gauge, Health, ImageComponent, InputState, Interactive, Lifetime, Obstacle, OffScreenDestroy, Parent, ParticleEmitter, Physics, Player, Position, ScreenClamp, ScreenWrap, SpawnInput, Spring, Sprite, StateMachine, StateMachineState, Tags, TextBlock, TextEffectComponent, TextEffectFn, TileLegendEntry, TilemapComponent, Trail, Tween, TweenEntry, TypewriterComponent, Velocity, VisualBounds, } from "@shared/types";
export { DEFAULT_CONFIG } from "@shared/types";
export { audio, beep, type Channel, getVolume, type Instrument, isMuted, mute, type Pattern, pauseMusic, playMusic, playTrackerMusic, resumeMusic, setMusicVolume, setVolume, sfx, stopMusic, stopTrackerMusic, type TrackerSong, toggleMute, unmute, } from "./audio/audio";
export { type Achievement, type AchievementCondition, type AchievementState, AchievementTracker, } from "./behaviors/achievements";
export { type ChaseOptions, createChaseBehavior, createFleeBehavior, createPatrolBehavior, createWanderBehavior, type FleeOptions, type PatrolOptions, type WanderOptions, } from "./behaviors/ai";
export { type CanCraftResult, type CraftIngredient, type CraftOutput, type CraftResult, canCraft, craft, type Recipe, RecipeBook, } from "./behaviors/crafting";
export { add as addCurrency, type CurrencyId, type CurrencyTransaction, type CurrencyWallet, canAfford, clearHistory, createWallet, deserializeWallet, getBalance, getHistory, type SerializedWallet, serializeWallet, setBalance, setCap, spend as spendCurrency, spendMulti, transfer as transferCurrency, } from "./behaviors/currency";
export { createDamageFlash, createDamageSystem, type DamageComponent, type DamageFlashOptions, type DamageSystemConfig, } from "./behaviors/damage";
export { type DialogChoice, type DialogContext, type DialogNode, type DialogTree, runDialogTree, } from "./behaviors/dialog-tree";
export { canEquip, clearEquipment, createEquipment, deserializeEquipment, type EquipmentComponent, type EquipmentSlotId, type EquippableItem, equipItem, getEquipped, isSlotAvailable, type SerializedEquipment, serializeEquipment, unequipItem, } from "./behaviors/equipment";
export { addItem, clearInventory, countItem, createInventory, findSlot, getSlot, hasItem, type InventoryComponent, type InventoryItem, type InventorySlot, isFull, removeItem, totalWeight, transferItem, } from "./behaviors/inventory";
export { createSeededRandom, type LootContext, type LootDrop, type LootEntry, type LootTable, rollLoot, } from "./behaviors/loot";
export { createPlatformSystem, type PlatformSystemOpts, } from "./behaviors/platform";
export { type QuestDefinition, type QuestObjective, type QuestState, type QuestStatus, QuestTracker, } from "./behaviors/quests";
export { addModifier, clearModifiers, createStats, deserializeStats, getModifiersFor, getStat, hasModifier, type ModifierType, removeModifier, removeModifiersBySource, type StatModifier, type Stats, serializeStats, setBaseStat, tickModifiers, } from "./behaviors/stats";
export { createWaveSpawner, type WaveDefinition, type WaveEnemy, type WaveSpawnerConfig, } from "./behaviors/wave-spawner";
export { createMultiplayerGame, type GameMove, type MultiplayerGameHandle, type MultiplayerOpts, type MultiplayerTransport, } from "./core/create-multiplayer-game";
export { type BoundMoves, buildGameScene, defineGame, type GameContext, type GameDefinition, type GameResult, GameRuntime, type MoveFn, type MoveInputCtx, type MoveResult, type MovesMap, type PhaseConfig, type PlayersConfig, type SetupContext, type TurnsConfig, } from "./core/define-game";
export { Engine } from "./core/engine";
export { defineScene, type Scene } from "./core/scene";
export { defaultHashState, fnv1a32, stableStringify } from "./core/state-hash";
export { type TurnConfig, TurnManager } from "./core/turn-manager";
export { type AnimatedArtAsset, type ArtAsset, artFromString, type SpriteSheet, spriteSheetFrames, } from "./data/art-asset";
export { ASCII_SPRITES, asciiBox, createAsciiFrames, createAsciiSprite, parseAsciiArt, } from "./data/ascii-sprites";
export { type AmbientDriftOpts, createAmbientDriftSystem, } from "./ecs/ambient-drift";
export { animationSystem } from "./ecs/animation-system";
export { createCollisionEventSystem } from "./ecs/collision-event-system";
export { type CursorRepelOpts, createCursorRepelSystem, } from "./ecs/cursor-repel";
export { emitterSystem } from "./ecs/emitter-system";
export { gaugeSystem } from "./ecs/gauge-system";
export { interactionSystem, makeInteractive } from "./ecs/interaction-system";
export { lifetimeSystem } from "./ecs/lifetime-system";
export { measureSystem } from "./ecs/measure-system";
export { parentSystem } from "./ecs/parent-system";
export { createEntityPool, type EntityPool, type PoolOptions, } from "./ecs/pool";
export { screenBoundsSystem } from "./ecs/screen-bounds-system";
export { springSystem } from "./ecs/spring-system";
export { stateMachineSystem, transition } from "./ecs/state-machine-system";
export { defineSystem, type System, SystemPriority } from "./ecs/systems";
export { createTags } from "./ecs/tags";
export { trailSystem } from "./ecs/trail-system";
export { typewriterSystem } from "./ecs/typewriter-system";
export { createWorld, type GameWorld, type WorldEntity } from "./ecs/world";
export { type BindingEntry, type BindingsConfig, createDefaultBindings, DEFAULT_BINDINGS, InputBindings, } from "./input/bindings";
export { GAMEPAD_BUTTONS, Gamepad } from "./input/gamepad";
export { Keyboard } from "./input/keyboard";
export { Mouse } from "./input/mouse";
export { type PinchGesture, type SwipeGesture, type TapGesture, Touch, type TouchGesture, type TouchOptions, type TouchPoint, } from "./input/touch";
export { type ClientFrame, GameServer, type GameServerOptions, type PeerHandle, type PublicRoomInfo, type Room, type RoomCreationOptions, type RoomListFilter, type ServerFrame, } from "./net/game-server";
export { MockAdapter, type MockAdapterOptions, MockBus, } from "./net/mock-adapter";
export { generatePeerId, NetEmitter, type NetLifecycleHandler, type NetMessageHandler, type NetPeerHandler, type NetworkAdapter, type Unsubscribe, } from "./net/network-adapter";
export { SocketAdapter, type SocketAdapterOptions, } from "./net/socket-adapter";
export { type DesyncEvent, type TurnCompleteEvent, TurnSync, type TurnSyncOptions, } from "./net/turn-sync";
export { type Collidable, overlapAll, overlaps } from "./physics/collision";
export { physicsSystem } from "./physics/physics-system";
export { pairsFromHash, SpatialHash } from "./physics/spatial-hash";
export { AsciiRenderer } from "./render/ascii-renderer";
export { Camera, type CameraBounds, type CameraFollowOpts, type CameraFollowTarget, } from "./render/camera";
export { type Anchor, BORDERS, type BorderStyle, CanvasUI, DialogManager, type UIBarOpts, type UIChoiceOpts, type UIDialogOpts, UIGrid, type UIGridCell, type UIGridOpts, type UIInlineChunk, type UIInlineRunOpts, UIMenu, type UIMenuOpts, type UIPanelOpts, UIScrollPanel, type UIScrollPanelOpts, type UITabDef, UITabs, type UITabsOpts, UITextField, type UITextFieldOpts, type UITextOpts, type UITextPanelOpts, UITextView, type UITextViewOpts, UITooltip, type UITooltipOpts, } from "./render/canvas-ui";
export { clearImageCache, getCachedImage, loadImage, preloadImages } from "./render/image-loader";
export { buildVisualBounds, type CharacterPosition, measureAsciiVisual, measureCharacterPositions, measureSpriteCharacterPositions, measureSpriteVisual, measureTextBlockVisual, resolveAutoCollider, } from "./render/measure-entity";
export { createNullCanvas, createNullCtx } from "./render/null-ctx";
export { type Particle, ParticlePool } from "./render/particles";
export { drawQuickHud, type QuickHudOpts } from "./render/quick-hud";
export { type CachedSprite, getCachedSprite, invalidateSpriteCache, spriteCacheSize, } from "./render/sprite-cache";
export { compose, fadeIn, flicker, float, glitch, popIn, pulse, rainbow, scatter, shake, spiral, sway, textEffect, throb, wave, } from "./render/text-effects";
export { clearTextCache, getLineCount, insertSoftHyphens, type JustifiedLine, type JustifiedWord, layoutJustifiedBlock, layoutTextAroundObstacles, layoutTextBlock, measureHeight, measureLineWidth, parseStyledText, type RenderedLine, type StyledSegment, shrinkwrap, stripTags, } from "./render/text-layout";
export { ToastManager } from "./render/toast";
export { Transition, type TransitionType } from "./render/transitions";
export { type Orientation, type SafeAreaInsets, Viewport } from "./render/viewport";
export { VirtualDpad, type VirtualDpadOptions, VirtualJoystick, type VirtualJoystickOptions, } from "./render/virtual-controls";
export { clearAll as clearStorage, clearHighScores, type GameStateSources, getHighScores, getTopScore, has as hasStorage, isHighScore, load, loadCompressed, type RehydratedGameState, type RehydrateOptions, rehydrateGameState, remove as removeStorage, type ScoreEntry, type SerializedGameState, save, saveCompressed, serializeGameState, setStoragePrefix, submitScore, } from "./storage/index";
export { type SaveSlot, SaveSlotManager, type SaveSlotManagerOptions, type SaveSlotMetadata, } from "./storage/save-slots";
export { createTilemap, isSolidAt, tileAt } from "./tiles/tilemap";
export { hsl, hsla, lerpColor, rainbow as rainbowColor } from "./utils/color";
export { Cutscene, cutscene } from "./utils/cutscene";
export { type BSPConfig, type CaveConfig, type DungeonConfig, type DungeonResult, type DungeonTiles, generateBSP, generateCave, generateDungeon, generateWalkerCave, gridMapToTilemapData, type Rect, type RoomInfo, type WalkerConfig, } from "./utils/dungeon";
export { GridMap, gridDistance, gridToWorld, worldToGrid } from "./utils/grid";
export { add, chance, clamp, dist, dot, len, lerp, normalize, pick, rng, rngInt, scale, sub, type Vec2, vec2, } from "./utils/math";
export { createNoise2D, generateNoiseGrid, type NoiseOptions } from "./utils/noise";
export { findPath, type PathOptions } from "./utils/pathfinding";
export { clearAssetCache, getAsset, type PreloadAsset, type PreloadOptions, type PreloadResult, preloadAssets, } from "./utils/preloader";
export { Scheduler } from "./utils/scheduler";
export { SpringPresets } from "./utils/spring-presets";
export { Cooldown, easeOut, tween } from "./utils/timer";
```

## Component Types (from shared/types.ts)

```ts
export interface CharTransform {
    dx: number;
    dy: number;
    color?: string;
    opacity?: number;
    scale?: number;
    char?: string;
}

export type TextEffectFn = (charIndex: number, totalChars: number, time: number) => CharTransform;

export interface TextEffectComponent {
    fn: TextEffectFn;
}

export interface Position {
    x: number;
    y: number;
}

export interface Velocity {
    vx: number;
    vy: number;
}

export interface Acceleration {
    ax: number;
    ay: number;
}

export interface Ascii {
    char: string;
    font: string;
    color: string;
    glow?: string;
    opacity?: number;
    scale?: number;
    /** Render layer. Lower = behind, higher = in front. Default 0. */
    layer?: number;
}

export interface Sprite {
    /** Array of strings, one per line. Rendered centered on position. */
    lines: string[];
    font: string;
    color: string;
    glow?: string;
    opacity?: number;
    /** Render layer. Default 0. */
    layer?: number;
    /** Per-character color mapping. Maps individual characters to colors.
     *  Characters not in the map use the default `color`. Spaces are skipped.
     *  Example: { '@': '#ff4444', '~': '#44aa44', '*': '#ffcc00' } */
    colorMap?: Record<string, string>;
}

export interface TextBlock {
    text: string;
    font: string;
    maxWidth: number;
    lineHeight: number;
    color: string;
    /** Text alignment. Default 'left'. */
    align?: "left" | "center" | "right" | "justify";
    /** Glow / shadow color. Applied via canvas shadowBlur. */
    glow?: string;
    /** If true, preserve \n as hard line breaks (pre-wrap mode). Default false. */
    preWrap?: boolean;
    /** Render layer. Default 0. */
    layer?: number;
}

export interface Collider {
    type: "circle" | "rect";
    width: number;
    height: number;
    sensor?: boolean;
    /** Internal marker — set when collider was resolved from `"auto"`. */
    _auto?: boolean;
    /** Collision group bitmask. Default 1. Entities collide when (a.group & b.mask) !== 0 AND (b.group & a.mask) !== 0. */
    group?: number;
    /** Collision mask bitmask. Default 0xFFFFFFFF (all groups). */
    mask?: number;
}

export type CollisionCallback = (a: Partial<Entity>, b: Partial<Entity>) => void;

export interface Health {
    current: number;
    max: number;
}

export interface Lifetime {
    remaining: number;
}

export interface Player {
    index: number;
}

export interface Obstacle {
    radius: number;
}

export interface ParticleEmitter {
    rate: number;
    spread: number;
    speed: number;
    lifetime: number;
    char: string;
    color: string;
    _acc: number;
}

export interface Physics {
    gravity?: number;
    friction?: number;
    drag?: number;
    bounce?: number;
    maxSpeed?: number;
    mass?: number;
    grounded?: boolean;
}

export interface Tags {
    values: Set<string>;
}

export interface Parent {
    children: Partial<Entity>[];
}

export interface Child {
    parent: Partial<Entity>;
    /** Offset from parent position */
    offsetX: number;
    offsetY: number;
    /** If true, child inherits parent's rotation (future) */
    inheritRotation?: boolean;
}

export interface ImageComponent {
    /** The loaded HTMLImageElement (use engine.loadImage() to get one) */
    image: HTMLImageElement;
    /** Render width in px. If 0, uses natural width. */
    width: number;
    /** Render height in px. If 0, uses natural height. */
    height: number;
    /** Opacity 0-1 */
    opacity?: number;
    /** Render layer (same system as ascii/sprite) */
    layer?: number;
    /** Anchor point: 'center' (default) or 'topLeft' */
    anchor?: "center" | "topLeft";
    /** Optional rotation in radians */
    rotation?: number;
    /** Tint — not applied directly, but available for game logic */
    tint?: string;
}

export interface AnimationFrame {
    /** For ascii entities: the character(s) to display */
    char?: string;
    /** For sprite entities: the lines to display */
    lines?: string[];
    /** Optional color override per frame */
    color?: string;
    /** Duration of this frame in seconds. If omitted, uses animation.frameDuration */
    duration?: number;
}

export interface Animation {
    frames: AnimationFrame[];
    /** Default duration per frame in seconds */
    frameDuration: number;
    /** Current frame index (managed by system) */
    currentFrame: number;
    /** Time accumulated on current frame (managed by system) */
    elapsed: number;
    /** Loop the animation? Default true */
    loop?: boolean;
    /** Is the animation playing? Default true */
    playing?: boolean;
    /** Callback name/event when animation completes (non-looping) */
    onComplete?: "destroy" | "stop";
}

export interface StateMachineState {
    /** Called once when entering this state */
    enter?: (entity: Partial<Entity>, engine: any) => void;
    update?: (entity: Partial<Entity>, engine: any, dt: number) => void;
    exit?: (entity: Partial<Entity>, engine: any) => void;
}

export interface StateMachine {
    /** Current state name */
    current: string;
    /** Map of state name → state definition */
    states: Record<string, StateMachineState>;
    /** Set by game code to trigger a transition. System processes and clears it. */
    next?: string;
}

export interface Tween {
    tweens: TweenEntry[];
}

export interface TweenEntry {
    /** Dot-path to the property, e.g. 'position.x' or 'ascii.opacity' */
    property: string;
    from: number;
    to: number;
    duration: number;
    elapsed: number;
    ease: "linear" | "easeOut" | "easeIn" | "easeInOut";
    /** If true, remove the entity when this tween completes */
    destroyOnComplete?: boolean;
}

export interface ScreenWrap {
    /** Extra margin before wrapping (default 0). */
    margin?: number;
}

export interface ScreenClamp {
    /** Padding from edge (default 0). */
    padding?: number;
}

export interface OffScreenDestroy {
    /** Margin beyond screen edge before destroying (default 50). */
    margin?: number;
}

export interface Trail {
    /** Spawn interval in seconds. Default 0.05. */
    interval?: number;
    /** Lifetime of each trail entity in seconds. Default 0.3. */
    lifetime?: number;
    /** Trail color. If omitted, uses the entity's ascii/sprite color. */
    color?: string;
    /** Opacity of trail when spawned (fades to 0). Default 0.5. */
    opacity?: number;
    /** Internal accumulator. */
    _acc?: number;
}

export interface VisualBounds {
    width: number;
    height: number;
    halfW: number;
    halfH: number;
    /** Dirty-tracking key — hash of (text + font + scale). Internal use. */
    _key: string;
}

export interface Spring {
    targetX: number;
    targetY: number;
    strength: number;
    damping: number;
}

export interface Gauge {
    current: number;
    max: number;
    /** Number of characters wide. */
    width: number;
    fillChar?: string;
    emptyChar?: string;
    color?: string;
    emptyColor?: string;
}

export interface TypewriterComponent {
    fullText: string;
    revealed: number;
    /** Characters per second. */
    speed: number;
    done: boolean;
    /** Internal accumulator — do not set manually. */
    _acc: number;
    onComplete?: () => void;
    onChar?: (char: string) => void;
}

export interface Interactive {
    hovered: boolean;
    clicked: boolean;
    dragging: boolean;
    dragOffset: {
        x: number;
        y: number;
    };
    cursor?: string;
    /** If true, position updates follow mouse while dragging. Set false for manual handling. */
    autoMove?: boolean;
}

export interface TileLegendEntry {
    color?: string;
    bg?: string;
    solid?: boolean;
    [key: string]: unknown;
}

export interface TilemapComponent {
    data: string[];
    legend: Record<string, TileLegendEntry>;
    cellSize: number;
    offsetX: number;
    offsetY: number;
    font?: string;
    layer?: number;
}

export interface Entity {
    position: Position;
    velocity: Velocity;
    acceleration: Acceleration;
    ascii: Ascii;
    sprite: Sprite;
    textBlock: TextBlock;
    collider: Collider;
    health: Health;
    lifetime: Lifetime;
    player: Player;
    obstacle: Obstacle;
    emitter: ParticleEmitter;
    physics: Physics;
    tags: Tags;
    tween: Tween;
    animation: Animation;
    stateMachine: StateMachine;
    image: ImageComponent;
    parent: Parent;
    child: Child;
    screenWrap: ScreenWrap;
    screenClamp: ScreenClamp;
    offScreenDestroy: OffScreenDestroy;
    gauge: Gauge;
    typewriter: TypewriterComponent;
    interactive: Interactive;
    tilemap: TilemapComponent;
    textEffect: TextEffectComponent;
    trail: Trail;
    visualBounds: VisualBounds;
    spring: Spring;
    [key: string]: any;
}

export type GameEntity<T extends Record<string, any> = {}> = Partial<Entity> & T;

export type SpawnInput = Omit<Partial<Entity>, "collider"> & {
    /** Pass `"auto"` to auto-size from the entity's ascii/sprite/textBlock bounds via Pretext measurement. */
    collider?: Collider | "auto";
};

export interface GameTime {
    dt: number;
    elapsed: number;
    frame: number;
    fps: number;
}

export interface InputState {
    keys: Set<string>;
    justPressed: Set<string>;
    justReleased: Set<string>;
    mouse: {
        x: number;
        y: number;
        down: boolean;
    };
    mouseJustDown: boolean;
    mouseJustUp: boolean;
}

export interface EngineConfig {
    width: number;
    height: number;
    targetFps: number;
    bgColor: string;
    font: string;
    fontSize: number;
    debug: boolean;
    headlessWidth?: number;
    headlessHeight?: number;
}

export declare const DEFAULT_CONFIG: EngineConfig;

```
