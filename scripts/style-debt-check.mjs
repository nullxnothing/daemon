import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGETS = ['src/panels', 'src/components']
const BASELINE = {
  literalFontSize: 993,
  literalRadius: 383,
  hexColors: 245,
  inlineShadow: 62,
}

const RULES = [
  ['literalFontSize', /font-size:\s*[0-9]+px/g],
  ['literalRadius', /border-radius:\s*[0-9]+px/g],
  ['hexColors', /#[0-9a-fA-F]{3,8}/g],
  ['inlineShadow', /box-shadow:\s*0/g],
]

const INCLUDE = new Set(['.css', '.tsx'])
const counts = Object.fromEntries(RULES.map(([key]) => [key, 0]))

for (const target of TARGETS) {
  walk(path.join(ROOT, target), (filePath) => {
    if (!INCLUDE.has(path.extname(filePath))) return
    const source = fs.readFileSync(filePath, 'utf8')
    for (const [key, pattern] of RULES) {
      counts[key] += source.match(pattern)?.length ?? 0
    }
  })
}

let failed = false
for (const [key, value] of Object.entries(counts)) {
  const baseline = BASELINE[key]
  const status = value <= baseline ? 'ok' : 'regressed'
  console.log(`${key}: ${value}/${baseline} ${status}`)
  if (value > baseline) failed = true
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
