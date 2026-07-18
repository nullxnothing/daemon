const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { scanExternals } = require('./lite-deps.cjs')

const ROOT = path.join(__dirname, '..')
const TEMPLATE_DIR = path.join(ROOT, 'build', 'lite-runtime')
const STAGE_DIR = path.join(ROOT, 'release-lite', '.stage')
const DIST_DIRS = ['dist-electron-lite', 'dist-lite']

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertRuntimeRoots(runtimeManifest) {
  const expected = Object.keys(runtimeManifest.dependencies ?? {}).sort()
  const actual = [...scanExternals()].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Lite runtime roots changed. Expected ${expected.join(', ')}; found ${actual.join(', ')}`)
  }
  for (const name of expected) {
    const installed = readJson(path.join(ROOT, 'node_modules', name, 'package.json')).version
    if (runtimeManifest.dependencies[name] !== installed) {
      throw new Error(`Lite runtime ${name} must be pinned to installed version ${installed}`)
    }
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function prepareStage() {
  const rootManifest = readJson(path.join(ROOT, 'package.json'))
  const runtimeManifest = readJson(path.join(TEMPLATE_DIR, 'package.json'))
  assertRuntimeRoots(runtimeManifest)

  fs.rmSync(STAGE_DIR, { recursive: true, force: true })
  fs.mkdirSync(STAGE_DIR, { recursive: true })
  for (const file of ['package.json', 'pnpm-lock.yaml', '.npmrc']) {
    fs.copyFileSync(path.join(TEMPLATE_DIR, file), path.join(STAGE_DIR, file))
  }

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  run(pnpm, ['install', '--prod', '--frozen-lockfile', '--ignore-scripts', '--ignore-workspace'], STAGE_DIR)

  const electronRebuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild')
  const electronVersion = rootManifest.devDependencies.electron.replace(/^\^/, '')
  run(electronRebuild, [
    '--force',
    '--only',
    'better-sqlite3,node-pty',
    '--module-dir',
    STAGE_DIR,
    '--version',
    electronVersion,
    '--arch',
    process.arch,
  ], ROOT)

  for (const dir of DIST_DIRS) {
    fs.cpSync(path.join(ROOT, dir), path.join(STAGE_DIR, dir), { recursive: true })
  }

  fs.writeFileSync(path.join(STAGE_DIR, 'package.json'), `${JSON.stringify({
    ...runtimeManifest,
    name: rootManifest.name,
    version: rootManifest.version,
    main: 'dist-electron-lite/main/lite.js',
    description: rootManifest.description,
    author: rootManifest.author,
    license: rootManifest.license,
  }, null, 2)}\n`)
}

prepareStage()
