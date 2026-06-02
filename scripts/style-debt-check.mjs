import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGETS = ['src/panels', 'src/components']
// Ratchet only — lower these as debt is paid down, never raise. Set to the current
// actuals so any new literal fails CI and pushes contributors to tokens/primitives.
const BASELINE = {
  literalFontSize: 11,
  literalRadius: 90,
  hexColors: 51,
  inlineShadow: 43,
  handRolledHeaders: 0,
}

const RULES = [
  ['literalFontSize', /font-size:\s*[0-9]+px/g],
  ['literalRadius', /border-radius:\s*[0-9]+px/g],
  ['hexColors', /#[0-9a-fA-F]{3,8}/g],
  ['inlineShadow', /box-shadow:\s*0/g],
]

const INCLUDE = new Set(['.css', '.tsx'])
const counts = Object.fromEntries(RULES.map(([key]) => [key, 0]))

// Header consistency: panel .tsx files that hand-roll a top-level header
// (<header className="*-header"> or "*-panel-header") instead of the shared
// PanelHeader primitive. Ratchet down as panels migrate; this should now stay at 0.
const HAND_ROLLED_HEADER = /<header className="[a-z-]*-header"|className="[a-z-]*-panel-header"/
const handRolledHeaderFiles = []

for (const target of TARGETS) {
  walk(path.join(ROOT, target), (filePath) => {
    if (!INCLUDE.has(path.extname(filePath))) return
    const source = fs.readFileSync(filePath, 'utf8')
    for (const [key, pattern] of RULES) {
      counts[key] += source.match(pattern)?.length ?? 0
    }
    if (
      filePath.includes(`${path.sep}panels${path.sep}`) &&
      filePath.endsWith('.tsx') &&
      HAND_ROLLED_HEADER.test(source) &&
      !source.includes('PanelHeader')
    ) {
      handRolledHeaderFiles.push(path.relative(ROOT, filePath))
    }
  })
}

counts.handRolledHeaders = handRolledHeaderFiles.length

let failed = false
for (const [key, value] of Object.entries(counts)) {
  const baseline = BASELINE[key]
  const status = value <= baseline ? 'ok' : 'regressed'
  console.log(`${key}: ${value}/${baseline} ${status}`)
  if (value > baseline) failed = true
}

if (counts.handRolledHeaders > BASELINE.handRolledHeaders) {
  console.error('Hand-rolled panel headers detected. Use the shared PanelHeader primitive:')
  for (const file of handRolledHeaderFiles) console.error(`  - ${file}`)
}

if (failed) {
  console.error('Style debt increased. Use design tokens/primitives instead of new literals.')
  process.exit(1)
}

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, visit)
    } else if (entry.isFile()) {
      visit(fullPath)
    }
  }
}
