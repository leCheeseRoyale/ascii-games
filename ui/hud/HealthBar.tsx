import { COLORS } from "@shared/constants";
import { AsciiText } from "@ui/shared/AsciiText";
import { useStore } from "@ui/store";

function lerpColor(ratio: number): string {
  // Green (#00ff88) → Yellow (#ffaa00) → Red (#ff4444)
  if (ratio > 0.5) {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(255 * (1 - t));
    const g = Math.round(170 + (255 - 170) * t);
    const b = Math.round(0 + (136 - 0) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = ratio * 2;
  const r = 255;
  const g = Math.round(68 + (170 - 68) * t);
  const b = Math.round(68 + (0 - 68) * t);
  return `rgb(${r},${g},${b})`;
}

export function HealthBar() {
  const health = useStore((s) => s.health);
  const maxHealth = useStore((s) => s.maxHealth);

  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  const totalBars = 10;
  const filled = Math.round(ratio * totalBars);
  const empty = totalBars - filled;
  const color = lerpColor(ratio);

  const filledStr = "█".repeat(filled);
  const emptyStr = "░".repeat(empty);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <AsciiText size="sm" color={COLORS.dim}>
        HP
      </AsciiText>
      <span
        style={{
          fontFamily: '"Fira Code", monospace',
          fontSize: "16px",
          letterSpacing: "0.05em",
          userSelect: "none",
        }}
      >
        <span style={{ color }}>{filledStr}</span>
        <span style={{ color: COLORS.dim }}>{emptyStr}</span>
      </span>
    </div>
  );
}
