import { useEffect } from 'react'
import { useStore } from '@ui/store'
import { events } from '@shared/events'
import { COLORS } from '@shared/constants'
import { AsciiText } from '@ui/shared/AsciiText'

const TITLE_ART = `
 █████╗ ███████╗ ██████╗██╗██╗
██╔══██╗██╔════╝██╔════╝██║██║
███████║███████╗██║     ██║██║
██╔══██║╚════██║██║     ██║██║
██║  ██║███████║╚██████╗██║██║
╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝╚═╝
`.trim()

export function MainMenu() {
  const setScreen = useStore((s) => s.setScreen)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        events.emit('game:start')
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
        backgroundColor: 'rgba(10, 10, 10, 0.92)',
        zIndex: 20,
      }}
    >
      <AsciiText size="sm" color={COLORS.accent} glow>
        {TITLE_ART}
      </AsciiText>

      <div style={{ marginTop: '24px' }}>
        <AsciiText size="lg" color={COLORS.fg}>
          GAME ENGINE
        </AsciiText>
      </div>

      <div style={{ marginTop: '48px' }}>
        <AsciiText size="md" color={COLORS.dim} blink>
          [ Press SPACE to start ]
        </AsciiText>
      </div>

      <div style={{ marginTop: '80px' }}>
        <AsciiText size="sm" color={COLORS.dim}>
          v1.0 — Powered by ASCII
        </AsciiText>
      </div>
    </div>
  )
}
