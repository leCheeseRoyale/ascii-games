#!/usr/bin/env node

/**
 * create-ascii-game — scaffold a new ASCII game project in seconds.
 *
 * Usage:
 *   npx create-ascii-game my-game
 *   npx create-ascii-game my-game --template asteroid-field
 *   npx create-ascii-game   (uses current directory)
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const REPO = 'https://github.com/leCheeseRoyale/ascii-games.git'

// ── Parse args ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flags = {}
const positional = []

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template' || args[i] === '-t') {
    flags.template = args[++i]
  } else if (args[i] === '--help' || args[i] === '-h') {
    flags.help = true
  } else if (!args[i].startsWith('-')) {
    positional.push(args[i])
  }
}

if (flags.help) {
  console.log(`
  \x1b[1m\x1b[36mcreate-ascii-game\x1b[0m — scaffold a new ASCII game project

  \x1b[1mUsage:\x1b[0m
    npx create-ascii-game \x1b[33m<directory>\x1b[0m [options]

  \x1b[1mOptions:\x1b[0m
    -t, --template <name>   Use a specific template (see list below)
    -h, --help              Show this help message

  \x1b[1mTemplates:\x1b[0m
    blank            Empty starter template
    asteroid-field   Real-time action (ECS)
    platformer       Side-scrolling platformer (ECS)
    roguelike        Turn-based dungeon crawler (ECS)
    physics-text     Interactive ASCII art with physics (ECS)
    tic-tac-toe      Classic board game (defineGame)
    connect-four     Drop-disc board game (defineGame)

  \x1b[1mExamples:\x1b[0m
    npx create-ascii-game my-game
    npx create-ascii-game my-game --template asteroid-field
    npx create-ascii-game .
`)
  process.exit(0)
}

// ── Resolve target directory ─────────────────────────────────────────

const targetArg = positional[0]

if (!targetArg) {
  console.error('\n  \x1b[31mPlease specify a project directory:\x1b[0m')
  console.error('    npx create-ascii-game \x1b[33mmy-game\x1b[0m\n')
  process.exit(1)
}

const targetDir = resolve(targetArg)
const projectName = basename(targetDir)

if (existsSync(targetDir) && targetArg !== '.') {
  const contents = readdirSync(targetDir)
  if (contents.length > 0) {
    console.error(`\n  \x1b[31mDirectory "${projectName}" already exists and is not empty.\x1b[0m\n`)
    process.exit(1)
  }
}

// ── Check for git ────────────────────────────────────────────────────

try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
} catch {
  console.error('\n  \x1b[31mgit is required but not found.\x1b[0m Install git and try again.\n')
  process.exit(1)
}

// ── Clone ────────────────────────────────────────────────────────────

console.log(`\n  \x1b[1m\x1b[36mASCII Game Engine\x1b[0m\n`)
console.log(`  Creating \x1b[33m${projectName}\x1b[0m...\n`)

try {
  execFileSync('git', ['clone', '--depth=1', REPO, targetDir], { stdio: 'pipe' })
} catch (err) {
  console.error(`  \x1b[31mFailed to clone repository.\x1b[0m`)
  console.error(`  ${err.message}\n`)
  process.exit(1)
}

// Remove .git so user starts fresh
rmSync(join(targetDir, '.git'), { recursive: true, force: true })

// Remove project-specific directories the user doesn't need
for (const dir of ['.claude', 'packages', 'plans', 'wiki']) {
  rmSync(join(targetDir, dir), { recursive: true, force: true })
}

// Init fresh git repo
execFileSync('git', ['init'], { cwd: targetDir, stdio: 'pipe' })

console.log('  \x1b[32m\u2713\x1b[0m Cloned engine')

// ── Install deps ─────────────────────────────────────────────────────

// Detect package manager
const hasBun = (() => {
  try { execFileSync('bun', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

const pm = hasBun ? 'bun' : 'npm'

console.log(`  Installing dependencies with ${pm}...`)

try {
  execFileSync(pm, ['install'], { cwd: targetDir, stdio: 'pipe' })
  console.log('  \x1b[32m\u2713\x1b[0m Dependencies installed')
} catch {
  console.log(`  \x1b[33m!\x1b[0m Could not auto-install. Run \`${pm} install\` manually.`)
}

// ── Initialize game from template ────────────────────────────────────

if (flags.template) {
  console.log(`  Initializing template: \x1b[33m${flags.template}\x1b[0m`)
  const initArgs = hasBun
    ? ['run', 'scripts/init-game.ts', flags.template]
    : ['run', 'init:game', flags.template]
  const initCmd = hasBun ? 'bun' : 'npm'
  const result = spawnSync(initCmd, initArgs, {
    cwd: targetDir,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.log('  \x1b[33m!\x1b[0m Template init had issues. You can run it manually later.')
  }
}

// ── Done ─────────────────────────────────────────────────────────────

const cdCmd = targetArg === '.' ? '' : `cd ${projectName} && `
const devCmd = hasBun ? 'bun dev' : 'npx vite'

console.log(`
  \x1b[32m\u2713 Done!\x1b[0m

  \x1b[1mGet started:\x1b[0m
    ${cdCmd}\x1b[36m${devCmd}\x1b[0m

  \x1b[2mFirst run auto-detects no game and shows the template picker.\x1b[0m
  \x1b[2mOr pick one now: ${hasBun ? 'bun run' : 'npx'} init:game <blank|asteroid-field|platformer|roguelike|physics-text|tic-tac-toe|connect-four>\x1b[0m
`)
