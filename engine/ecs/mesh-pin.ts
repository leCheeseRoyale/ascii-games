import { defineSystem } from "./systems";

export type MeshPinSelector = "top" | "bottom" | "left" | "right" | "corners" | MeshPinFn;

export type MeshPinFn = (col: number, row: number, cols: number, rows: number) => boolean;

export interface MeshPinOpts {
  /** Which cells to pin. Default 'top'. */
  pin?: MeshPinSelector;
  /** Only affect meshes with this tag. Optional. */
  tag?: string;
}

function resolvePinFn(pin: MeshPinSelector): MeshPinFn {
  if (typeof pin === "function") return pin;
  switch (pin) {
    case "top":
      return (_c, r) => r === 0;
    case "bottom":
      return (_c, r, _cols, rows) => r === rows - 1;
    case "left":
      return (c) => c === 0;
    case "right":
      return (c, _r, cols) => c === cols - 1;
    case "corners":
      return (c, r, cols, rows) => (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1);
  }
}

export function createMeshPinSystem(opts?: MeshPinOpts) {
  const pinFn = resolvePinFn(opts?.pin ?? "top");
  const tag = opts?.tag;

  return defineSystem({
    name: "mesh-pin",
    update(engine) {
      // --- ECS mesh cells ---
      for (const e of engine.world.with("position", "velocity", "spring", "meshCell")) {
        if (tag && !e.tags?.values.has(tag)) continue;

        const mc = e.meshCell;
        if (pinFn(mc.col, mc.row, mc.cols, mc.rows)) {
          e.position.x = e.spring.targetX;
          e.position.y = e.spring.targetY;
          e.velocity.vx = 0;
          e.velocity.vy = 0;
        }
      }

      // --- SoA meshes ---
      for (const mesh of engine.soaMeshes.values()) {
        for (let i = 0; i < mesh.count; i++) {
          if (!mesh.alive[i]) continue;

          if (pinFn(mesh.cellCol[i], mesh.cellRow[i], mesh.cols, mesh.rows)) {
            mesh.posX[i] = mesh.homeX[i];
            mesh.posY[i] = mesh.homeY[i];
            mesh.velX[i] = 0;
            mesh.velY[i] = 0;
          }
        }
      }
    },
  });
}
