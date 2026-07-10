/**
 * DAEMON Lite packaging gate. Fails the build when:
 *  1. a banned heavy package appears in the lite runtime dependency closure
 *     (someone re-introduced an IDE/Solana import into the lite main graph), or
 *  2. the built installer exceeds the size budget.
 *
 * Run after build:lite (closure check) and again after electron-builder
 * (size check picks up the installer when present).
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { liteRuntimePackages } = require('./lite-deps.cjs')

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// Electron 41's runtime compresses to ~90MB alone; the app payload (36MB asar)
// adds ~15MB. 110MB is the practical NSIS floor for this Electron major.
const MAX_INSTALLER_BYTES = 110 * 1024 * 1024

const BANNED = [
  '@raydium-io/raydium-sdk-v2',
  'monaco-editor',
  '@monaco-editor/react',
  'node-pty',
  '@xterm/xterm',
  'pyright',
  'typescript-language-server',
  'playwright',
  'puppeteer-core',
  'viem',
  'ethers',
]
const BANNED_PREFIXES = ['@metaplex-foundation/', '@meteora-ag/', '@xterm/', '@playwright/']

const packages = liteRuntimePackages()
const banned = packages.filter(
  (name) => BANNED.includes(name) || BANNED_PREFIXES.some((p) => name.startsWith(p)),
)

if (banned.length > 0) {
  console.error('[lite-gate] FAIL — banned packages in the Lite runtime closure:')
  for (const name of banned) console.error(`  - ${name}`)
  console.error('A new import in the lite main graph is dragging these in. Sever it (module swap or lazy import).')
  process.exit(1)
}

console.log(`[lite-gate] closure ok — ${packages.length} runtime packages, none banned`)

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const installer = path.join(ROOT, 'release-lite', pkg.version, 'DAEMON-Lite-setup.exe')
if (fs.existsSync(installer)) {
  const bytes = fs.statSync(installer).size
  const mb = (bytes / 1024 / 1024).toFixed(1)
  if (bytes > MAX_INSTALLER_BYTES) {
    console.error(`[lite-gate] FAIL — installer ${mb} MB exceeds the ${MAX_INSTALLER_BYTES / 1024 / 1024} MB budget`)
    process.exit(1)
  }
  console.log(`[lite-gate] installer ok — ${mb} MB`)
} else {
  console.log('[lite-gate] installer not built yet — size check skipped')
}
