/**
 * @ascii-engine — Public API
 *
 * Import everything from '@engine':
 *   import { Engine, defineScene, defineSystem, ... } from '@engine'
 */

export { COLORS, FONTS, PALETTES } from "@shared/constants";
export { events } from "@shared/events";
// Re-export shared types
export type {
  Acceleration,
  Animation,
  AnimationFrame,
  Ascii,
  CharTransform,
  Child,
  Collider,
  CollisionCallback,
  EngineConfig,
  Entity,
  GameEntity,
  GameTime,
  Gauge,
  Health,
  ImageComponent,
  InputState,
  Interactive,
  Lifetime,
  MeshCell,
  Obstacle,
  OffScreenDestroy,
  Parent,
  ParticleEmitter,
  Physics,
  Player,
  Position,
  ScreenClamp,
  ScreenWrap,
  SoAMeshProxy,
  SpawnInput,
  Spring,
  Sprite,
  StateMachine,
  StateMachineState,
  Tags,
  TextBlock,
  TextEffectComponent,
  TextEffectFn,
  TileLegendEntry,
  TilemapComponent,
  Trail,
  Tween,
  TweenEntry,
  TypewriterComponent,
  Velocity,
  VisualBounds,
} from "@shared/types";
export { DEFAULT_CONFIG } from "@shared/types";
// Audio
export {
  audio,
  beep,
  type Channel,
  getVolume,
  type Instrument,
  isMuted,
  mute,
  type Pattern,
  pauseMusic,
  playMusic,
  playTrackerMusic,
  resumeMusic,
  setMusicVolume,
  setVolume,
  sfx,
  stopMusic,
  stopTrackerMusic,
  type TrackerSong,
  toggleMute,
  unmute,
} from "./audio/audio";
export {
  type Achievement,
  type AchievementCondition,
  type AchievementState,
  AchievementTracker,
} from "./behaviors/achievements";
// Behaviors — optional reusable game logic
export {
  type ChaseOptions,
  createChaseBehavior,
  createFleeBehavior,
  createPatrolBehavior,
  createWanderBehavior,
  type FleeOptions,
  type PatrolOptions,
  type WanderOptions,
} from "./behaviors/ai";
// Crafting — recipes, ingredient consumption, chance rolls
export {
  type CanCraftResult,
  type CraftIngredient,
  type CraftOutput,
  type CraftResult,
  canCraft,
  craft,
  type Recipe,
  RecipeBook,
} from "./behaviors/crafting";
// Currency — multi-currency wallet with transactions, caps, history
export {
  add as addCurrency,
  type CurrencyId,
  type CurrencyTransaction,
  type CurrencyWallet,
  canAfford,
  clearHistory,
  createWallet,
  deserializeWallet,
  getBalance,
  getHistory,
  type SerializedWallet,
  serializeWallet,
  setBalance,
  setCap,
  spend as spendCurrency,
  spendMulti,
  transfer as transferCurrency,
} from "./behaviors/currency";
export {
  createDamageFlash,
  createDamageSystem,
  type DamageComponent,
  type DamageFlashOptions,
  type DamageSystemConfig,
} from "./behaviors/damage";
export {
  type DialogChoice,
  type DialogContext,
  type DialogNode,
  type DialogTree,
  runDialogTree,
} from "./behaviors/dialog-tree";
// Equipment — slot-based gear, ties inventory + stats
export {
  canEquip,
  clearEquipment,
  createEquipment,
  deserializeEquipment,
  type EquipmentComponent,
  type EquipmentSlotId,
  type EquippableItem,
  equipItem,
  getEquipped,
  isSlotAvailable,
  type SerializedEquipment,
  serializeEquipment,
  unequipItem,
} from "./behaviors/equipment";
export {
  addItem,
  clearInventory,
  countItem,
  createInventory,
  findSlot,
  getSlot,
  hasItem,
  type InventoryComponent,
  type InventoryItem,
  type InventorySlot,
  isFull,
  removeItem,
  totalWeight,
  transferItem,
} from "./behaviors/inventory";
export {
  createSeededRandom,
  type LootContext,
  type LootDrop,
  type LootEntry,
  type LootTable,
  rollLoot,
} from "./behaviors/loot";
// Platform — one-way platform collision
export {
  createPlatformSystem,
  type PlatformSystemOpts,
} from "./behaviors/platform";
export {
  type QuestDefinition,
  type QuestObjective,
  type QuestState,
  type QuestStatus,
  QuestTracker,
} from "./behaviors/quests";
export {
  addModifier,
  clearModifiers,
  createStats,
  deserializeStats,
  getModifiersFor,
  getStat,
  hasModifier,
  type ModifierType,
  removeModifier,
  removeModifiersBySource,
  type StatModifier,
  type Stats,
  serializeStats,
  setBaseStat,
  tickModifiers,
} from "./behaviors/stats";
export {
  createWaveSpawner,
  type WaveDefinition,
  type WaveEnemy,
  type WaveSpawnerConfig,
} from "./behaviors/wave-spawner";
// Core
export {
  createMultiplayerGame,
  type GameMove,
  type MultiplayerGameHandle,
  type MultiplayerOpts,
  type MultiplayerTransport,
} from "./core/create-multiplayer-game";
export {
  type BoundMoves,
  buildGameScene,
  defineGame,
  type GameContext,
  type GameDefinition,
  type GameResult,
  GameRuntime,
  type MoveFn,
  type MoveInputCtx,
  type MoveResult,
  type MovesMap,
  type PhaseConfig,
  type PlayersConfig,
  type SetupContext,
  type TurnsConfig,
} from "./core/define-game";
export { Engine, type SpawnImageMeshOpts } from "./core/engine";
export { defineScene, type Scene } from "./core/scene";
export { defaultHashState, fnv1a32, stableStringify } from "./core/state-hash";
export { type TurnConfig, TurnManager } from "./core/turn-manager";
// Data — Art assets
export {
  type AnimatedArtAsset,
  type ArtAsset,
  artFromString,
  type SpriteSheet,
  spriteSheetFrames,
} from "./data/art-asset";
// Data — Sprite library
export {
  ASCII_SPRITES,
  asciiBox,
  createAsciiFrames,
  createAsciiSprite,
  parseAsciiArt,
} from "./data/ascii-sprites";
export {
  type AmbientDriftOpts,
  createAmbientDriftSystem,
} from "./ecs/ambient-drift";
export { animationSystem } from "./ecs/animation-system";
// Collision events — enter/stay/exit callbacks between tagged entity groups
export { createCollisionEventSystem } from "./ecs/collision-event-system";
// Interactive text helpers — cursor repulsion + ambient drift system factories
export {
  type CursorRepelOpts,
  createCursorRepelSystem,
} from "./ecs/cursor-repel";
export { emitterSystem } from "./ecs/emitter-system";
// Optional systems (not auto-registered — add with engine.addSystem())
export { gaugeSystem } from "./ecs/gauge-system";
export { interactionSystem, makeInteractive } from "./ecs/interaction-system";
export { lifetimeSystem } from "./ecs/lifetime-system";
export { measureSystem } from "./ecs/measure-system";
// Mesh render — image slices + connecting lines for meshCell entities
export { meshRenderSystem, renderMeshCells } from "./ecs/mesh-render-system";
export type { MeshShape, MeshShapeFn } from "./ecs/mesh-shapes";
export { parentSystem } from "./ecs/parent-system";
export {
  createEntityPool,
  type EntityPool,
  type PoolOptions,
} from "./ecs/pool";
export { screenBoundsSystem } from "./ecs/screen-bounds-system";
// SoA mesh — fast path for image meshes with 500+ cells
export {
  applySoAMeshForce,
  createSoAMesh,
  destroySoAMeshCell,
  type SoAMesh,
} from "./ecs/soa-mesh";
export { soaMeshSystem } from "./ecs/soa-mesh-system";
export { springSystem } from "./ecs/spring-system";
export { stateMachineSystem, transition } from "./ecs/state-machine-system";
export { defineSystem, type System, SystemPriority } from "./ecs/systems";
export { createTags } from "./ecs/tags";
// Trail — afterimage effect behind moving entities
export { trailSystem } from "./ecs/trail-system";
export { typewriterSystem } from "./ecs/typewriter-system";
// ECS
export { createWorld, type GameWorld, type WorldEntity } from "./ecs/world";
// Input
export {
  type BindingEntry,
  type BindingsConfig,
  createDefaultBindings,
  DEFAULT_BINDINGS,
  InputBindings,
} from "./input/bindings";
export { GAMEPAD_BUTTONS, Gamepad } from "./input/gamepad";
export { Keyboard } from "./input/keyboard";
export { Mouse } from "./input/mouse";
// Touch input & virtual controls — mobile web support
export {
  type PinchGesture,
  type SwipeGesture,
  type TapGesture,
  Touch,
  type TouchGesture,
  type TouchOptions,
  type TouchPoint,
} from "./input/touch";
// GameServer — Bun WebSocket server (server-only, requires Bun runtime).
// Import this module only in server processes, not in browser bundles.
export {
  type ClientFrame,
  GameServer,
  type GameServerOptions,
  type PeerHandle,
  type PublicRoomInfo,
  type Room,
  type RoomCreationOptions,
  type RoomListFilter,
  type ServerFrame,
} from "./net/game-server";
// Mock in-memory adapter — for tests and single-player "AI peer" testing
export {
  MockAdapter,
  type MockAdapterOptions,
  MockBus,
} from "./net/mock-adapter";
// Multiplayer networking — NetworkAdapter interface + implementations
export {
  generatePeerId,
  NetEmitter,
  type NetLifecycleHandler,
  type NetMessageHandler,
  type NetPeerHandler,
  type NetworkAdapter,
  type Unsubscribe,
} from "./net/network-adapter";
// WebSocket client adapter — connects to a GameServer
export {
  SocketAdapter,
  type SocketAdapterOptions,
} from "./net/socket-adapter";
// Lockstep turn helper — works over any NetworkAdapter
export {
  type DesyncEvent,
  type TurnCompleteEvent,
  TurnSync,
  type TurnSyncOptions,
} from "./net/turn-sync";
// Physics
export { type Collidable, overlapAll, overlaps } from "./physics/collision";
export { physicsSystem } from "./physics/physics-system";
export { pairsFromHash, SpatialHash } from "./physics/spatial-hash";
// Rendering
export { AsciiRenderer } from "./render/ascii-renderer";
export {
  Camera,
  type CameraBounds,
  type CameraFollowOpts,
  type CameraFollowTarget,
} from "./render/camera";
// Canvas UI
// Canvas UI — additional primitives
export {
  type Anchor,
  BORDERS,
  type BorderStyle,
  CanvasUI,
  DialogManager,
  type UIBarOpts,
  type UIChoiceOpts,
  type UIDialogOpts,
  UIGrid,
  type UIGridCell,
  type UIGridOpts,
  type UIInlineChunk,
  type UIInlineRunOpts,
  UIMenu,
  type UIMenuOpts,
  type UIPanelOpts,
  UIScrollPanel,
  type UIScrollPanelOpts,
  type UITabDef,
  UITabs,
  type UITabsOpts,
  UITextField,
  type UITextFieldOpts,
  type UITextOpts,
  type UITextPanelOpts,
  UITextView,
  type UITextViewOpts,
  UITooltip,
  type UITooltipOpts,
} from "./render/canvas-ui";
// Images
export { clearImageCache, getCachedImage, loadImage, preloadImages } from "./render/image-loader";
// Text measurement — entity-level visual bounds + character decomposition
export {
  buildVisualBounds,
  type CharacterPosition,
  measureAsciiVisual,
  measureCharacterPositions,
  measureSpriteCharacterPositions,
  measureSpriteVisual,
  measureTextBlockVisual,
  resolveAutoCollider,
} from "./render/measure-entity";
// Null context/canvas for headless engine mode
export { createNullCanvas, createNullCtx } from "./render/null-ctx";
export { type Particle, ParticlePool } from "./render/particles";
// Quick HUD — one-liner score/health/lives overlay
export { drawQuickHud, type QuickHudOpts } from "./render/quick-hud";
// Sprite bitmap cache
export {
  type CachedSprite,
  getCachedSprite,
  invalidateSpriteCache,
  spriteCacheSize,
} from "./render/sprite-cache";
// Text effects
export {
  compose,
  fadeIn,
  flicker,
  float,
  glitch,
  popIn,
  pulse,
  rainbow,
  scatter,
  shake,
  spiral,
  sway,
  textEffect,
  throb,
  wave,
} from "./render/text-effects";
// Text layout — styled text & justification
export {
  clearTextCache,
  getLineCount,
  insertSoftHyphens,
  type JustifiedLine,
  type JustifiedWord,
  layoutJustifiedBlock,
  layoutTextAroundObstacles,
  layoutTextBlock,
  measureCharCell,
  measureHeight,
  measureLineWidth,
  parseStyledText,
  type RenderedLine,
  type StyledSegment,
  shrinkwrap,
  stripTags,
} from "./render/text-layout";
export { ToastManager } from "./render/toast";
// Transitions
export { Transition, type TransitionType } from "./render/transitions";
export { type Orientation, type SafeAreaInsets, Viewport } from "./render/viewport";
export {
  VirtualDpad,
  type VirtualDpadOptions,
  VirtualJoystick,
  type VirtualJoystickOptions,
} from "./render/virtual-controls";
// Storage / persistence
export {
  clearAll as clearStorage,
  clearHighScores,
  type GameStateSources,
  getHighScores,
  getTopScore,
  has as hasStorage,
  isHighScore,
  load,
  loadCompressed,
  type RehydratedGameState,
  type RehydrateOptions,
  rehydrateGameState,
  remove as removeStorage,
  type ScoreEntry,
  type SerializedGameState,
  save,
  saveCompressed,
  serializeGameState,
  setStoragePrefix,
  submitScore,
} from "./storage/index";
// Save slot manager — multi-slot saves with metadata, autosave, migration
export {
  type SaveSlot,
  SaveSlotManager,
  type SaveSlotManagerOptions,
  type SaveSlotMetadata,
} from "./storage/save-slots";
// Tilemap
export { createTilemap, isSolidAt, tileAt } from "./tiles/tilemap";
// Utils — Color
export { hsl, hsla, lerpColor, rainbow as rainbowColor } from "./utils/color";
// Utils — Cutscene
export { Cutscene, cutscene } from "./utils/cutscene";
// Utils — Dungeon / Procedural generation
export {
  type BSPConfig,
  type CaveConfig,
  type DungeonConfig,
  type DungeonResult,
  type DungeonTiles,
  generateBSP,
  generateCave,
  generateDungeon,
  generateWalkerCave,
  gridMapToTilemapData,
  type Rect,
  type RoomInfo,
  type WalkerConfig,
} from "./utils/dungeon";
// Utils — Grid
export { GridMap, gridDistance, gridToWorld, worldToGrid } from "./utils/grid";
// Utils — Math
export {
  add,
  chance,
  clamp,
  dist,
  dot,
  len,
  lerp,
  normalize,
  pick,
  rng,
  rngInt,
  scale,
  sub,
  type Vec2,
  vec2,
} from "./utils/math";
// Utils — Noise
export { createNoise2D, generateNoiseGrid, type NoiseOptions } from "./utils/noise";
// Utils — Pathfinding
export { findPath, type PathOptions } from "./utils/pathfinding";
// Utils — Asset preloader
export {
  clearAssetCache,
  getAsset,
  type PreloadAsset,
  type PreloadOptions,
  type PreloadResult,
  preloadAssets,
} from "./utils/preloader";
export { Scheduler } from "./utils/scheduler";
// Utils — Spring presets
export { SpringPresets } from "./utils/spring-presets";
// Utils — Timer & Scheduler
export { Cooldown, easeOut, tween } from "./utils/timer";
