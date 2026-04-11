/**
 * Typewriter System — progressively reveals text character by character.
 *
 * Entities with a `typewriter` component get their text content updated
 * over time, revealing one character at a time at the configured speed.
 *
 * Works with both `ascii.char` and `textBlock.text`.
 *
 * Not auto-registered. Add with: engine.addSystem(typewriterSystem)
 */

import type { Engine } from "../core/engine";
import type { System } from "./systems";

export const typewriterSystem: System = {
  name: "_typewriter",

  update(engine: Engine, dt: number) {
    for (const entity of engine.world.with("typewriter")) {
      const tw = entity.typewriter;
      if (tw.done) continue;

      tw._acc += dt;
      const interval = 1 / tw.speed;

      while (tw._acc >= interval && tw.revealed < tw.fullText.length) {
        tw._acc -= interval;
        tw.revealed++;
        tw.onChar?.(tw.fullText[tw.revealed - 1]);
      }

      const visibleText = tw.fullText.slice(0, tw.revealed);

      const e = entity as Record<string, unknown>;
      const textBlock = e.textBlock as { text: string } | undefined;
      const ascii = e.ascii as { char: string } | undefined;
      if (textBlock) textBlock.text = visibleText;
      else if (ascii) ascii.char = visibleText;

      if (tw.revealed >= tw.fullText.length) {
        tw.done = true;
        tw.onComplete?.();
      }
    }
  },
};
