import { defineScene } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";
import { createPlayer } from "../entities/player";
import { asteroidSpawnerSystem } from "../systems/asteroid-spawner";
import { collisionSystem, resetScore } from "../systems/collision";
import { playerInputSystem } from "../systems/player-input";

export const playScene = defineScene({
  name: "play",

  setup(engine) {
    const store = useStore.getState();
    store.setScreen("playing");
    store.setScore(0);
    store.setHealth(GAME.player.maxHealth, GAME.player.maxHealth);
    resetScore();

    // Spawn player at center
    engine.spawn(createPlayer(engine.width / 2, engine.height / 2));

    // Add game systems
    engine.addSystem(playerInputSystem);
    engine.addSystem(asteroidSpawnerSystem);
    engine.addSystem(collisionSystem);
  },

  update(engine, _dt) {
    // Sync store with debug info
    const entities = [...engine.world.with("position")].length;
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities);

    // Pause on Escape
    if (engine.keyboard.pressed("Escape")) {
      if (engine.isPaused) {
        engine.resume();
        useStore.getState().setScreen("playing");
      } else {
        engine.pause();
        useStore.getState().setScreen("paused");
      }
    }
  },
});
