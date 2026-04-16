/**
 * HUD System — Canvas UI overlay (no phase, runs every frame).
 *
 * Draws health bar, floor info, player stats, and a scrolling
 * message log using engine.ui.text(), engine.ui.bar(), and
 * engine.ui.textPanel().
 */

import { COLORS, defineSystem, type Engine, FONTS } from "@engine";
import { GAME } from "../config";
import { getMessages } from "../scenes/play";

export const hudSystem = defineSystem({
  name: "hud",

  update(engine: Engine) {
    const player = engine.findByTag("player");
    if (!player?.health || !player.playerStats) return;

    const hp = player.health.current;
    const maxHp = player.health.max;
    const stats = player.playerStats;
    const floor = stats.floor;
    const level = stats.level;
    const xp = stats.xp;
    const atk = stats.attack;
    const def = stats.defense;

    // Health bar (top-left)
    engine.ui.text(16, 20, `Floor ${floor}`, {
      color: GAME.dungeon.stairsColor,
      font: FONTS.bold,
    });

    engine.ui.text(16, 44, "HP", {
      color: COLORS.danger,
      font: FONTS.bold,
    });
    engine.ui.bar(44, 44, 12, hp / maxHp, {
      fillColor: hp / maxHp > 0.3 ? "#00ff88" : "#ff4444",
      emptyColor: "#333333",
      label: `${hp}/${maxHp}`,
      labelColor: COLORS.fg,
    });

    // Stats (top-left, below health)
    engine.ui.text(16, 68, `Lv.${level}  ATK:${atk}  DEF:${def}  XP:${xp}`, {
      color: COLORS.dim,
      font: FONTS.small,
    });

    // Turn indicator (top-right)
    const turnPhase = engine.turns.currentPhase ?? "---";
    const turnCount = engine.turns.turnCount;
    engine.ui.text(engine.width - 16, 20, `Turn ${turnCount}`, {
      color: COLORS.dim,
      font: FONTS.small,
      align: "right",
    });
    engine.ui.text(engine.width - 16, 36, turnPhase.toUpperCase(), {
      color: turnPhase === "player" ? COLORS.accent : COLORS.warning,
      font: FONTS.small,
      align: "right",
    });

    // Message log (bottom)
    const messages = getMessages();
    const logY = engine.height - 16 - messages.length * 18;

    engine.ui.panel(8, logY - 8, engine.width - 16, messages.length * 18 + 16, {
      bg: "rgba(0, 0, 0, 0.75)",
      border: "single",
      borderColor: "#333333",
    });

    for (let i = 0; i < messages.length; i++) {
      const alpha = 1.0 - (messages.length - 1 - i) * 0.15;
      const color = i === messages.length - 1 ? COLORS.fg : COLORS.dim;
      engine.ui.text(16, logY + i * 18, messages[i], {
        color,
        font: FONTS.small,
        opacity: Math.max(0.3, alpha),
      });
    }

    // Controls hint (bottom-right)
    engine.ui.text(engine.width - 16, engine.height - 16, "WASD/Arrows: Move  Space: Wait", {
      color: "#444444",
      font: FONTS.small,
      align: "right",
    });
  },
});
