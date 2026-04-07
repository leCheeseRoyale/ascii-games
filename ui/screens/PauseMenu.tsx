import { useEffect } from 'react'
import { useStore } from '@ui/store'
import { events } from '@shared/events'
import { COLORS } from '@shared/constants'
import { AsciiText } from '@ui/shared/AsciiText'

export function PauseMenu() {
  const setScreen = useStore((s) => s.setScreen)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        events.emit('game:resume')
        setScreen('playing')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setScreen])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        zIndex: 30,
      }}
    >
      <AsciiText size="xl" color={COLORS.warning} glow>
        PAUSED
      </AsciiText>

      <div style={{ marginTop: '32px' }}>
        <AsciiText size="md" color={COLORS.dim} blink>
          [ Press ESC to resume ]
        </AsciiText>
      </div>
    </div>
  )
}
