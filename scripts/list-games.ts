#!/usr/bin/env bun
/**
 * List available game templates in the games/ directory.
 * Usage: bun run list:games
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const gamesDir = 'games'

try {
  const entries = await readdir(gamesDir, { withFileTypes: true })
  const dirs = entries.filter((d) => d.isDirectory())

  if (dirs.length === 0) {
    console.log('No game templates found in games/')
    process.exit(0)
  }

  console.log('\nAvailable game templates:\n')

  for (const d of dirs) {
    const configPath = join(gamesDir, d.name, 'game.config.ts')
    const file = Bun.file(configPath)
    let name = d.name
    let description = ''

    if (await file.exists()) {
      const content = await file.text()
      const nameMatch = content.match(/name:\s*['"](.+?)['"]/)
      const descMatch = content.match(/description:\s*['"](.+?)['"]/)
      if (nameMatch) name = nameMatch[1]
      if (descMatch) description = descMatch[1]
    }

    console.log(`  ${d.name.padEnd(20)} ${name}`)
    if (description) {
      console.log(`  ${''.padEnd(20)} ${description}`)
    }
    console.log()
  }

  console.log('Usage: bun run init:game <template>\n')
} catch (err) {
  console.error('Could not read games/ directory:', err)
  process.exit(1)
}
