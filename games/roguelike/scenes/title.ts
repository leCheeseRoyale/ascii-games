/**
 * Title Scene — Main menu with UIMenu.
 *
 * Shows game title, a decorative dungeon snippet, and a menu
 * with New Game / Continue options. Uses save/load for persistence.
 */

import { COLORS, defineScene, type Engine, FONTS, load, sfx, UIMenu, wave } from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

let menu: UIMenu;
let hasSave = false;

export const titleScene = defineScene({
  name: "title",

  setup(engine: Engine) {
    useStore.getState().setScreen("menu");
    useStore.getState().reset();

    const cx = engine.centerX;
    const cy = engine.centerY;

    // Title text with wave effect
    engine.spawn({
      position: { x: cx, y: cy - 120 },
      ascii: {
        char: GAME.title,
        font: FONTS.huge,
        color: COLORS.accent,
        glow: "#00ff8844",
      },
      textEffect: { fn: wave(3) },
    });

    // Subtitle
    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: {
        char: GAME.description,
        font: FONTS.normal,
        color: COLORS.dim,
      },
    });

    // Decorative dungeon art
    engine.spawn({
      position: { x: cx, y: cy - 10 },
      sprite: {
        lines: [
          "  ####  ####  ",
          "  #..####..#  ",
          "  #........#  ",
          "  #..@..!..#  ",
          "  #........#  ",
          "  ####..####  ",
          "      ..      ",
          "  ####..####  ",
          "  #..r.....#  ",
          "  #........>  ",
          "  ##########  ",
        ],
        font: FONTS.normal,
        color: COLORS.dim,
        colorMap: {
          "@": GAME.player.color,
          r: GAME.enemies.rat.color,
          "!": GAME.items.healthPotion.color,
          ">": GAME.dungeon.stairsColor,
          "#": GAME.dungeon.wallColor,
        },
      },
    });

    // Check for save data
    const saveData = load<{ floor: number }>("roguelike-save");
    hasSave = saveData !== undefined;

    // Menu
    const menuItems = hasSave ? ["New Game", "Continue", "Controls"] : ["New Game", "Controls"];

    menu = new UIMenu(menuItems, {
      border: "double",
      title: "Main Menu",
      selectedColor: COLORS.accent,
      borderColor: "#555555",
      bg: "rgba(10, 10, 10, 0.9)",
      anchor: "center",
      onMove: () => sfx.menu(),
    });
  },

  update(engine: Engine) {
    menu.update(engine);
    menu.draw(engine.ui, engine.centerX, engine.centerY + 140);

    if (menu.confirmed) {
      const idx = menu.selectedIndex;
      const item = hasSave
        ? (["new", "continue", "controls"] as const)[idx]
        : (["new", "controls"] as const)[idx];

      switch (item) {
        case "new":
          sfx.menu();
          engine.loadScene("play", {
            transition: "dissolve",
            duration: 0.5,
            data: { floor: 1 },
          });
          break;

        case "continue": {
          sfx.menu();
          const saveData = load<Record<string, any>>("roguelike-save");
          if (saveData) {
            engine.loadScene("play", {
              transition: "dissolve",
              duration: 0.5,
              data: saveData,
            });
          }
          break;
        }

        case "controls":
          sfx.menu();
          engine.dialog.show(
            "WASD or Arrow Keys to move.\n" +
              "Walk into enemies to attack.\n" +
              "Space or Period to wait.\n" +
              "Walk over items to pick them up.\n" +
              "Reach the stairs (>) to descend.",
            { speaker: "Controls", border: "rounded", typeSpeed: 0 },
          );
          break;
      }
    }
  },
});
