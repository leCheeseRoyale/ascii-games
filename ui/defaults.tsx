/**
 * Default UI registrations.
 *
 * Registers the built-in screens and HUD components so the
 * asteroid-field game (and any game that doesn't customize UI) works out of the box.
 *
 * Imported by main.tsx on app start. Games can call registerScreen() or
 * setHUDComponents() after this to override defaults.
 */

import { HealthBar } from "./hud/HealthBar";
import { HUD } from "./hud/HUD";
import { registerHUDComponent } from "./hud/hud-registry";
import { Score } from "./hud/Score";
import { registerScreen } from "./screen-registry";
import { GameOverScreen } from "./screens/GameOverScreen";
import { MainMenu } from "./screens/MainMenu";
import { PauseMenu } from "./screens/PauseMenu";

// ── Default screens ──
registerScreen("menu", MainMenu);
registerScreen("playing", () => <HUD debug />);
registerScreen("paused", () => (
  <>
    <HUD />
    <PauseMenu />
  </>
));
registerScreen("gameOver", GameOverScreen);

// ── Default HUD components ──
registerHUDComponent(Score);
registerHUDComponent(HealthBar);
