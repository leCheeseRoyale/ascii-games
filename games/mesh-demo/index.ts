/**
 * Image Mesh Demo — Game Setup
 *
 * Canvas-only demo: showcases image mesh deformation with shapes,
 * spring physics, and cursor interaction. Returns empty screens/hud
 * to suppress the React overlay.
 */

import type { Engine } from "@engine";
import { playScene } from "./scenes/play";

const Empty = () => null;

export function setupGame(engine: Engine) {
  engine.registerScene(playScene);
  return {
    startScene: "play",
    screens: {
      menu: Empty,
      playing: Empty,
      gameOver: Empty,
    },
    hud: [],
  };
}
