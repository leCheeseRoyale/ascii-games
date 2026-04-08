import { COLORS } from "@shared/constants";
import { useStore } from "@ui/store";

export function Debug() {
  const fps = useStore((s) => s.fps);
  const entityCount = useStore((s) => s.entityCount);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        fontFamily: '"Fira Code", monospace',
        fontSize: "11px",
        color: COLORS.dim,
        opacity: 0.6,
        lineHeight: 1.5,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <div>FPS: {Math.round(fps)}</div>
      <div>ENT: {entityCount}</div>
    </div>
  );
}
