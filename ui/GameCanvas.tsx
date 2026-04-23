import { Engine } from "@engine";
import { setupGame } from "@game/index";
import { COLORS } from "@shared/constants";
import { events } from "@shared/events";
import type { ComponentType } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import { setHUDComponents } from "./hud/hud-registry";
import { registerScreen } from "./screen-registry";
import { extendStore, type StoreSlice } from "./store";

const EngineContext = createContext<React.MutableRefObject<Engine | null> | null>(null);

export function useEngine(): Engine | null {
  const ref = useContext(EngineContext);
  return ref?.current ?? null;
}

/** Result type that setupGame may return instead of a plain string. */
interface GameSetupResult {
  startScene: string;
  screens?: Record<string, ComponentType>;
  hud?: ComponentType[];
  store?: StoreSlice<Record<string, unknown>>;
}

export function GameCanvas({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, { debug: false });
    engineRef.current = engine;

    // Register scenes and get starting scene name
    let result: string | GameSetupResult;
    try {
      result = setupGame(engine) as string | GameSetupResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[GameCanvas] setupGame() threw:", msg);
      showCanvasError(canvas, `setupGame() threw:\n${msg}`);
      return;
    }

    if (result == null || (typeof result !== "string" && typeof result !== "object")) {
      const msg = `setupGame() returned ${String(result)} — expected a scene name string or { startScene, ... } object`;
      console.error(`[GameCanvas] ${msg}`);
      showCanvasError(canvas, msg);
      return;
    }

    let firstScene: string;
    if (typeof result === "string") {
      firstScene = result;
    } else {
      if (!result.startScene) {
        const msg = "setupGame() returned an object without startScene";
        console.error(`[GameCanvas] ${msg}`);
        showCanvasError(canvas, msg);
        return;
      }
      firstScene = result.startScene;
      // Register custom screens if provided
      if (result.screens) {
        for (const [name, component] of Object.entries(result.screens)) {
          registerScreen(name, component);
        }
      }
      // Replace HUD components if provided
      if (result.hud) {
        setHUDComponents(result.hud);
      }
      // Extend store with game-specific state
      if (result.store) {
        extendStore(result.store);
      }
    }

    // Listen for events from UI
    const onStart = () => {
      engine.loadScene(firstScene);
      if (engine.isPaused) engine.resume();
    };
    const onResume = () => {
      engine.resume();
    };
    const onRestart = () => {
      engine.loadScene(firstScene);
      if (engine.isPaused) engine.resume();
    };
    const onPause = () => {
      engine.pause();
    };

    events.on("game:start", onStart);
    events.on("game:resume", onResume);
    events.on("game:restart", onRestart);
    events.on("game:pause", onPause);

    // Start the engine with title scene
    engine.start("title").catch((err) => {
      // If 'title' scene doesn't exist, try the first scene from setupGame
      console.warn("Could not load title scene, trying:", firstScene, err);
      engine.start(firstScene).catch(console.error);
    });

    return () => {
      events.off("game:start", onStart);
      events.off("game:resume", onResume);
      events.off("game:restart", onRestart);
      events.off("game:pause", onPause);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    <EngineContext.Provider value={engineRef}>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          display: "block",
          backgroundColor: COLORS.bg,
        }}
      />
      {children}
    </EngineContext.Provider>
  );
}

function showCanvasError(canvas: HTMLCanvasElement, message: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ff6b6b";
  ctx.font = "bold 20px monospace";
  ctx.fillText("Game failed to start", 40, 60);
  ctx.fillStyle = "#e0e0e0";
  ctx.font = "14px monospace";
  const lines = message.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 40, 100 + i * 22);
  }
  ctx.fillStyle = "#888";
  ctx.font = "13px monospace";
  ctx.fillText("Check the browser console for details.", 40, 120 + lines.length * 22);
}
