# Engine API Reference (Auto-Generated)

> Generated from actual TypeScript declarations. Do not edit manually.
> Last generated: 2026-04-10

## Uncategorized

```ts
export { COLORS, FONTS, PALETTES } from "@shared/constants";
export { events } from "@shared/events";
export type { Acceleration, Animation, AnimationFrame, Ascii, Child, Collider, EngineConfig, Entity, GameEntity, GameTime, Gauge, Health, ImageComponent, InputState, Interactive, Lifetime, Obstacle, OffScreenDestroy, Parent, ParticleEmitter, Physics, Player, Position, ScreenClamp, ScreenWrap, Sprite, StateMachine, StateMachineState, Tags, TextBlock, TileLegendEntry, TilemapComponent, Tween, TweenEntry, TypewriterComponent, Velocity, } from "@shared/types";
export { DEFAULT_CONFIG } from "@shared/types";
export { audio, beep, getVolume, isMuted, mute, pauseMusic, playMusic, resumeMusic, setMusicVolume, setVolume, sfx, stopMusic, toggleMute, unmute, } from "./audio/audio";
export { Engine } from "./core/engine";
export { GameLoop } from "./core/game-loop";
export { defineScene, type Scene, SceneManager } from "./core/scene";
export { type TurnConfig, TurnManager } from "./core/turn-manager";
export { ASCII_SPRITES, asciiBox } from "./data/ascii-sprites";
export { animationSystem } from "./ecs/animation-system";
export { emitterSystem } from "./ecs/emitter-system";
export { gaugeSystem } from "./ecs/gauge-system";
export { interactionSystem, makeInteractive } from "./ecs/interaction-system";
export { lifetimeSystem } from "./ecs/lifetime-system";
export { parentSystem } from "./ecs/parent-system";
export { screenBoundsSystem } from "./ecs/screen-bounds-system";
export { stateMachineSystem, transition } from "./ecs/state-machine-system";
export { defineSystem, type System, SystemRunner } from "./ecs/systems";
export { typewriterSystem } from "./ecs/typewriter-system";
export { createWorld, type GameWorld, type WorldEntity } from "./ecs/world";
export { GAMEPAD_BUTTONS, Gamepad } from "./input/gamepad";
export { Keyboard } from "./input/keyboard";
export { Mouse } from "./input/mouse";
export { type Collidable, overlapAll, overlaps } from "./physics/collision";
export { physicsSystem } from "./physics/physics-system";
export { AsciiRenderer } from "./render/ascii-renderer";
export { Camera } from "./render/camera";
export { DebugOverlay } from "./render/debug";
export { clearImageCache, getCachedImage, loadImage, preloadImages } from "./render/image-loader";
export { type Particle, ParticlePool } from "./render/particles";
export { clearTextCache, getLineCount, layoutTextAroundObstacles, layoutTextBlock, measureHeight, type RenderedLine, shrinkwrap, } from "./render/text-layout";
export { ToastManager } from "./render/toast";
export { Transition, type TransitionType } from "./render/transitions";
export { clearAll as clearStorage, clearHighScores, getHighScores, getTopScore, has as hasStorage, isHighScore, load, remove as removeStorage, type ScoreEntry, save, setStoragePrefix, submitScore, } from "./storage/index";
export { createTilemap, isSolidAt, tileAt } from "./tiles/tilemap";
export { hsl, hsla, lerpColor, rainbow } from "./utils/color";
export { Cutscene, cutscene } from "./utils/cutscene";
export { GridMap, gridDistance, gridToWorld, worldToGrid } from "./utils/grid";
export { add, chance, clamp, dist, dot, len, lerp, normalize, pick, rng, rngInt, scale, sub, type Vec2, vec2, } from "./utils/math";
export { findPath, type PathOptions } from "./utils/pathfinding";
export { Scheduler } from "./utils/scheduler";
export { Cooldown, easeOut, tween } from "./utils/timer";
```

## Component Types (from shared/types.ts)

```ts
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
}

export interface TextBlock {
    text: string;
    font: string;
    maxWidth: number;
    lineHeight: number;
    color: string;
    /** Render layer. Default 0. */
    layer?: number;
}

export interface Collider {
    type: "circle" | "rect";
    width: number;
    height: number;
    sensor?: boolean;
}

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
    /** Called every frame while in this state */
    update?: (entity: Partial<Entity>, engine: any, dt: number) => void;
    /** Called once when leaving this state */
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
    [key: string]: any;
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
    /** Game-specific custom components. Use this for any data not covered above. */
    [key: string]: any;
}

export type GameEntity<T extends Record<string, any> = {}> = Partial<Entity> & T;

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
}

export declare const DEFAULT_CONFIG: EngineConfig;

```
