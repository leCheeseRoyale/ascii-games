#!/usr/bin/env bun
/**
 * Initialize a new game from a template.
 *
 * Usage:
 *   bun run init:game              — interactive template picker
 *   bun run init:game <template>   — use a specific template
 */
import { readdir, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline'

const GAMES_DIR = 'games'
const GAME_DIR = 'game'

// ── Helpers ──────────────────────────────────────────────────────────

async function getTemplates(): Promise<{ name: string; displayName: string; description: string }[]> {
  const entries = await readdir(GAMES_DIR, { withFileTypes: true })
  const templates: { name: string; displayName: string; description: string }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const configPath = join(GAMES_DIR, entry.name, 'game.config.ts')
    const file = Bun.file(configPath)
    let displayName = entry.name
    let description = ''

    if (await file.exists()) {
      const content = await file.text()
      const nameMatch = content.match(/name:\s*['"](.+?)['"]/)
      const descMatch = content.match(/description:\s*['"](.+?)['"]/)
      if (nameMatch) displayName = nameMatch[1]
      if (descMatch) description = descMatch[1]
    }

    templates.push({ name: entry.name, displayName, description })
  }

  return templates
}

async function copyDir(src: string, dest: string): Promise<string[]> {
  const created: string[] = []
  await mkdir(dest, { recursive: true })

  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      const sub = await copyDir(srcPath, destPath)
      created.push(...sub)
    } else {
      const destFile = Bun.file(destPath)
      if (await destFile.exists()) {
        console.log(`  ~ Skipped (exists): ${destPath}`)
      } else {
        const content = await Bun.file(srcPath).text()
        await Bun.write(destPath, content)
        console.log(`  + ${destPath}`)
        created.push(destPath)
      }
    }
  }

  return created
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ── Main ─────────────────────────────────────────────────────────────

const templates = await getTemplates()

if (templates.length === 0) {
  console.error(`No templates found in ${GAMES_DIR}/`)
  process.exit(1)
}

let templateName = process.argv[2]

// Interactive picker when no argument given
if (!templateName) {
  console.log('\n  \x1b[1m\x1b[36mASCII Game Engine\x1b[0m\n')
  console.log('  Pick a template:\n')

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]
    const num = `\x1b[1m${i + 1}\x1b[0m`
    const name = `\x1b[33m${t.name}\x1b[0m`
    const desc = t.description ? `\x1b[2m— ${t.description}\x1b[0m` : ''
    console.log(`  ${num}. ${name}  ${desc}`)
  }

  console.log()
  const answer = await prompt('  Enter number: ')
  const index = parseInt(answer, 10) - 1

  if (isNaN(index) || index < 0 || index >= templates.length) {
    console.error('\n  Invalid selection.\n')
    process.exit(1)
  }

  templateName = templates[index].name
}

// Validate template exists
const template = templates.find((t) => t.name === templateName)
if (!template) {
  console.error(`\n  Unknown template: "${templateName}"`)
  console.error(`  Available: ${templates.map((t) => t.name).join(', ')}\n`)
  process.exit(1)
}

// Check if game/ already has content
const gameFile = Bun.file(join(GAME_DIR, 'index.ts'))
if (await gameFile.exists()) {
  const answer = await prompt(`\n  game/ already has files. Overwrite? (y/N): `)
  if (answer.toLowerCase() !== 'y') {
    console.log('  Aborted.\n')
    process.exit(0)
  }
}

// Copy template
console.log(`\n  Initializing \x1b[33m${template.name}\x1b[0m...\n`)

const srcDir = join(GAMES_DIR, template.name)
const created = await copyDir(srcDir, GAME_DIR)

console.log(`\n  \x1b[32m\u2713\x1b[0m ${template.displayName} ready! (${created.length} files)\n`)
console.log('  Next steps:')
console.log('    \x1b[36mbun dev\x1b[0m             Start the dev server')
console.log('    Edit \x1b[33mgame/scenes/play.ts\x1b[0m  to change gameplay')
console.log('    \x1b[36mbun run new:scene\x1b[0m    Scaffold a new scene')
console.log('    \x1b[36mbun run new:system\x1b[0m   Scaffold a new system')
console.log('    \x1b[36mbun run new:entity\x1b[0m   Scaffold an entity factory')
console.log('    \x1b[36mbun run export\x1b[0m       Build single-file HTML\n')
