import { COLORS } from "@shared/constants";
import { AsciiText } from "@ui/shared/AsciiText";
import { useStore } from "@ui/store";

export function Score() {
  const score = useStore((s) => s.score);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <AsciiText size="sm" color={COLORS.dim}>
        SCORE
      </AsciiText>
      <AsciiText size="md" color={COLORS.accent} glow>
        {String(score).padStart(6, "0")}
      </AsciiText>
    </div>
  );
}
