import { Debug } from "./Debug";
import { getHUDComponents } from "./hud-registry";

interface HUDProps {
  debug?: boolean;
}

export function HUD({ debug = false }: HUDProps) {
  const components = getHUDComponents();

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
        {components.map((C) => (
          <C key={C.displayName || C.name || C.toString()} />
        ))}
      </div>
      {debug && <Debug />}
    </>
  );
}
