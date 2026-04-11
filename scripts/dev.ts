#!/usr/bin/env bun
/**
 * Smart dev command — auto-detects fresh projects.
 *
 * If game/ doesn't exist yet, runs the template picker first.
 * Then starts the Vite dev server.
 */
import { existsSync } from 'node:fs'

const GAME_INDEX = 'game/index.ts'

if (!existsSync(GAME_INDEX)) {
  console.log('\n  \x1b[2mNo game found — let\u2019s set one up.\x1b[0m')

  const init = Bun.spawnSync(['bun', 'run', 'scripts/init-game.ts'], {
    stdio: ['inherit', 'inherit', 'inherit'],
  })

  if (init.exitCode !== 0) {
    process.exit(init.exitCode ?? 1)
  }

  // Double-check it worked
  if (!existsSync(GAME_INDEX)) {
    console.error('\n  Setup was cancelled. Run \x1b[36mbun dev\x1b[0m again when ready.\n')
    process.exit(0)
  }
}

// Start Vite dev server
const vite = Bun.spawn(['bunx', 'vite'], {
  stdio: ['inherit', 'inherit', 'inherit'],
})

await vite.exited
