import { Engine } from "@engine";
import { setupGame } from "@game/index";
import { COLORS } from "@shared/constants";
import { events } from "@shared/events";
import type { ComponentType } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import { setHUDComponents } from "./hud/hud-registry";
import { registerScreen } from "./screen-registry";

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
    const result = setupGame(engine) as string | GameSetupResult;

    let firstScene: string;
    if (typeof result === "string") {
      firstScene = result;
    } else {
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
