// Stages the built bridge shim into packages/bridge-shim so the npm package
// ships the exact artifact the app distributes. Run via `pnpm run build:bridge-pkg`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist-bridge', 'daemon-bridge-shim.mjs')
const dest = path.join(root, 'packages', 'bridge-shim', 'daemon-bridge-shim.mjs')

if (!fs.existsSync(src)) {
  console.error('dist-bridge/daemon-bridge-shim.mjs not found. Run `pnpm run build:bridge` first.')
  process.exit(1)
}

fs.copyFileSync(src, dest)
const sizeKb = Math.round(fs.statSync(dest).size / 1024)
console.log(`staged ${path.relative(root, dest)} (${sizeKb} kB)`)
