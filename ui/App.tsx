import { useStore } from "@ui/store";
import { GameCanvas } from "./GameCanvas";
import { getScreen } from "./screen-registry";

export function App() {
  const screen = useStore((s) => s.screen);
  const ScreenComponent = getScreen(screen);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        backgroundColor: "#0a0a0a",
      }}
    >
      <GameCanvas />

      {/* Screen overlay from registry */}
      {ScreenComponent && <ScreenComponent />}
    </div>
  );
}
