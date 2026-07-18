/**
 * DAEMON Lite dependency closure. Scans the built lite main/preload bundles
 * for external module specifiers, then walks package.json dependencies
 * (pnpm hoisted layout — every package is at node_modules/<name>) to the
 * full runtime closure for the Lite dependency and size gate. Packaging uses
 * the isolated, locked runtime manifest under build/lite-runtime.
 */
const fs = require('node:fs')
const path = require('node:path')
const { builtinModules } = require('node:module')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist-electron-lite')

const SPECIFIER_PATTERNS = [
  /require\(\s*["']([^"']+)["']\s*\)/g,
  /from\s*["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
  /import\s*["']([^"']+)["']/g,
]

function isBuiltin(spec) {
  const head = spec.startsWith('node:') ? spec.slice(5) : spec
  return builtinModules.includes(head.split('/')[0])
}

function toPackageName(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
}

/** External package names imported by the built lite bundles. */
function scanExternals(distDir = DIST) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`lite bundles not built: ${distDir} missing — run build:lite first`)
  }
  const packages = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(p)
      } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
        const code = fs.readFileSync(p, 'utf8')
        for (const re of SPECIFIER_PATTERNS) {
          re.lastIndex = 0
          let match
          while ((match = re.exec(code))) {
            const spec = match[1]
            if (spec.startsWith('.') || isBuiltin(spec) || spec === 'electron') continue
            // Regex over minified code can cross string boundaries — accept
            // only plausible module specifiers.
            if (!/^(@[\w.-]+\/)?[\w.-]+(\/[\w.-]+)*$/.test(spec)) continue
            packages.add(toPackageName(spec))
          }
        }
      }
    }
  }
  walk(distDir)
  return packages
}

/** BFS over dependencies + optionalDependencies from the given roots. */
function dependencyClosure(roots) {
  const seen = new Set()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    const pkgJsonPath = path.join(ROOT, 'node_modules', name, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) continue // optional dep not installed
    seen.add(name)
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    for (const dep of [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]) {
      if (dep !== 'electron') queue.push(dep)
    }
  }
  return seen
}

function liteRuntimePackages() {
  return [...dependencyClosure([...scanExternals()])].sort()
}

/**
 * Packages electron-builder would auto-collect (the app's production
 * dependency tree). files globs cannot ADD node_modules content — the walker
 * collects every prod dep — so exclusion must be expressed as negations of
 * this set minus the lite closure.
 */
function appProdPackages() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return dependencyClosure(Object.keys(pkg.dependencies ?? {}))
}

/** Negation patterns for every collected package the Lite runtime never imports. */
function liteExcludePatterns() {
  const needed = new Set(liteRuntimePackages())
  return [...appProdPackages()]
    .filter((name) => !needed.has(name))
    .sort()
    .map((name) => `!node_modules/${name}/**`)
}

module.exports = { scanExternals, dependencyClosure, liteRuntimePackages, appProdPackages, liteExcludePatterns }
