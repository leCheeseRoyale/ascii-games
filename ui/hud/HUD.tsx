import { Debug } from "./Debug";
import { HealthBar } from "./HealthBar";
import { Score } from "./Score";

interface HUDProps {
  debug?: boolean;
}

export function HUD({ debug = false }: HUDProps) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <Score />
        <HealthBar />
      </div>
      {debug && <Debug />}
    </>
  );
}
