import { defineSystem, overlaps, sfx } from "@engine";
import { useStore } from "@ui/store";

let score = 0;

export const collectionSystem = defineSystem({
  name: "collection",

  init() {
    score = 0;
  },

  update(engine) {
    const players = [...engine.world.with("position", "collider", "tags")].filter((e) =>
      e.tags.values.has("player"),
    );

    const stars = [...engine.world.with("position", "collider", "tags")].filter((e) =>
      e.tags.values.has("star"),
    );

    const collected = new Set<object>();
    for (const player of players) {
      for (const star of stars) {
        if (collected.has(star)) continue;
        if (overlaps(player, star)) {
          collected.add(star);
          score += 100;
          useStore.getState().setScore(score);
          sfx.pickup();
          engine.particles.burst({
            x: star.position.x,
            y: star.position.y,
            count: 8,
            chars: ["*", ".", "+"],
            color: "#ffcc00",
            speed: 80,
            lifetime: 0.5,
          });
          engine.destroy(star);
        }
      }
    }
  },
});
