import type { Engine } from "@engine";
import { playScene } from "./scenes/play";
import { titleScene } from "./scenes/title";

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  return "title";
}
