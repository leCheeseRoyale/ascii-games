import type { Engine } from "@engine";
import { defineScene } from "@engine";
import { useStore } from "@ui/store";
import { createPlatform } from "../entities/platform";
import { createPlayer } from "../entities/player";
import { collectionSystem } from "../systems/collection";
import { platformCollisionSystem } from "../systems/platform-collision";
import { playerInputSystem } from "../systems/player-input";
import { starSpawnerSystem } from "../systems/star-spawner";

export const playScene = defineScene({
  name: "play",

  setup(engine: Engine) {
    useStore.getState().setScreen("playing");
    useStore.getState().setScore(0);

    // Spawn player a bit above the ground so gravity kicks in.
    engine.spawn(createPlayer(engine.width / 2, engine.height * 0.4));

    // Ground line (visual only — collision handled by platformCollisionSystem).
    const groundY = engine.height * 0.85 + 20;
    engine.spawn({
      position: { x: engine.width / 2, y: groundY },
      ascii: {
        char: "\u2500".repeat(80),
        font: '16px "Fira Code", monospace',
        color: "#444444",
      },
    });

    // A handful of floating platforms to jump between.
    engine.spawn(createPlatform(engine.width * 0.2, engine.height * 0.7, 8));
    engine.spawn(createPlatform(engine.width * 0.5, engine.height * 0.55, 10));
    engine.spawn(createPlatform(engine.width * 0.8, engine.height * 0.7, 8));
    engine.spawn(createPlatform(engine.width * 0.35, engine.height * 0.4, 6));
    engine.spawn(createPlatform(engine.width * 0.65, engine.height * 0.4, 6));

    engine.addSystem(playerInputSystem);
    engine.addSystem(platformCollisionSystem);
    engine.addSystem(starSpawnerSystem);
    engine.addSystem(collectionSystem);
  },

  update(engine: Engine) {
    const entities = [...engine.world.with("position")].length;
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities);

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
