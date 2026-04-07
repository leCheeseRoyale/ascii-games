import { useEffect, useRef, createContext, useContext } from 'react'
import { Engine } from '@engine'
import { events } from '@shared/events'
import { setupGame } from '@game/index'
import { COLORS } from '@shared/constants'

const EngineContext = createContext<React.MutableRefObject<Engine | null> | null>(null)

export function useEngine(): Engine | null {
  const ref = useContext(EngineContext)
  return ref?.current ?? null
}

export function GameCanvas({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new Engine(canvas, { debug: false })
    engineRef.current = engine

    // Register scenes and get starting scene name
    const firstScene = setupGame(engine)

    // Listen for events from UI
    const offStart = events.on('game:start', () => {
      engine.loadScene(firstScene)
      if (engine.isPaused) engine.resume()
    })

    const offResume = events.on('game:resume', () => {
      engine.resume()
    })

    const offRestart = events.on('game:restart', () => {
      engine.loadScene(firstScene)
      if (engine.isPaused) engine.resume()
    })

    const offPause = events.on('game:pause', () => {
      engine.pause()
    })

    // Start the engine with title scene
    engine.start('title').catch((err) => {
      // If 'title' scene doesn't exist, try the first scene from setupGame
      console.warn('Could not load title scene, trying:', firstScene, err)
      engine.start(firstScene).catch(console.error)
    })

    return () => {
      offStart()
      offResume()
      offRestart()
      offPause()
      engine.stop()
      engineRef.current = null
    }
  }, [])

  return (
    <EngineContext.Provider value={engineRef}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'block',
          backgroundColor: COLORS.bg,
        }}
      />
      {children}
    </EngineContext.Provider>
  )
}
