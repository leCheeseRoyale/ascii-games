import { useEffect } from 'react'
import { useStore } from '@ui/store'
import { events } from '@shared/events'
import { COLORS } from '@shared/constants'
import { AsciiText } from '@ui/shared/AsciiText'

export function GameOverScreen() {
  const score = useStore((s) => s.score)
  const highScore = useStore((s) => s.highScore)
  const setScreen = useStore((s) => s.setScreen)
  const reset = useStore((s) => s.reset)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        reset()
        events.emit('game:restart')
        setScreen('playing')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setScreen, reset])

  const isNewHighScore = score >= highScore && score > 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 10, 10, 0.92)',
        zIndex: 30,
      }}
    >
      <AsciiText size="xl" color={COLORS.danger} glow>
        GAME OVER
      </AsciiText>

      <div style={{ marginTop: '32px', textAlign: 'center' }}>
        <div>
          <AsciiText size="sm" color={COLORS.dim}>
            SCORE
          </AsciiText>
        </div>
        <div>
          <AsciiText size="lg" color={COLORS.fg}>
            {String(score).padStart(6, '0')}
          </AsciiText>
        </div>
      </div>

      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <div>
          <AsciiText size="sm" color={COLORS.dim}>
            {isNewHighScore ? '★ NEW HIGH SCORE ★' : 'HIGH SCORE'}
          </AsciiText>
        </div>
        <div>
          <AsciiText
            size="lg"
            color={isNewHighScore ? COLORS.accent : COLORS.dim}
            glow={isNewHighScore}
          >
            {String(highScore).padStart(6, '0')}
          </AsciiText>
        </div>
      </div>

      <div style={{ marginTop: '48px' }}>
        <AsciiText size="md" color={COLORS.dim} blink>
          [ Press SPACE to retry ]
        </AsciiText>
      </div>
    </div>
  )
}
