import { useStore } from '@ui/store'
import { GameCanvas } from './GameCanvas'
import { MainMenu } from './screens/MainMenu'
import { PauseMenu } from './screens/PauseMenu'
import { GameOverScreen } from './screens/GameOverScreen'
import { HUD } from './hud/HUD'

export function App() {
  const screen = useStore((s) => s.screen)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
      }}
    >
      <GameCanvas />

      {/* Screen overlays */}
      {screen === 'menu' && <MainMenu />}
      {screen === 'playing' && <HUD debug />}
      {screen === 'paused' && (
        <>
          <HUD />
          <PauseMenu />
        </>
      )}
      {screen === 'gameOver' && <GameOverScreen />}
    </div>
  )
}
