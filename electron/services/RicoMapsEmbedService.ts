import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RicoMapsEmbedStatus } from '../shared/types'
import { getHeliusApiKey } from './SolanaService'

const RICOMAPS_PORT = Number(process.env.RICOMAPS_PORT ?? 3600)
const RICOMAPS_PROJECT_PATH = process.env.RICOMAPS_PROJECT_PATH ?? path.join(os.homedir(), 'Projects', 'ricomaps')
const RICOMAPS_URL = `http://localhost:${RICOMAPS_PORT}`
const START_TIMEOUT_MS = 30_000

let ricoMapsProcess: ChildProcessWithoutNullStreams | null = null
let lastError: string | null = null

function packagePath(): string {
  return path.join(RICOMAPS_PROJECT_PATH, 'package.json')
}

function depsPath(): string {
  return path.join(RICOMAPS_PROJECT_PATH, 'node_modules', 'next')
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

async function isRicoMapsRunning(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1_500)
  try {
    const response = await fetch(RICOMAPS_URL, { signal: controller.signal })
    return response.ok || response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function getRicoMapsEmbedStatus(): Promise<RicoMapsEmbedStatus> {
  const running = await isRicoMapsRunning()
  return {
    url: RICOMAPS_URL,
    port: RICOMAPS_PORT,
    projectPath: RICOMAPS_PROJECT_PATH,
    installed: existsSync(packagePath()) && existsSync(depsPath()),
    running,
    pid: running ? (ricoMapsProcess?.pid ?? null) : null,
    error: lastError,
  }
}

export async function startRicoMapsEmbed(): Promise<RicoMapsEmbedStatus> {
  if (await isRicoMapsRunning()) return getRicoMapsEmbedStatus()
  if (!existsSync(packagePath())) throw new Error(`RicoMaps app not found at ${RICOMAPS_PROJECT_PATH}`)
  if (!existsSync(depsPath())) throw new Error(`RicoMaps dependencies are not installed at ${RICOMAPS_PROJECT_PATH}`)

  const heliusApiKey = getHeliusApiKey()
  if (!heliusApiKey) throw new Error('Helius API key not configured')

  lastError = null
  const command = npmCommand()
  const child = spawn(command, ['run', 'dev'], {
    cwd: RICOMAPS_PROJECT_PATH,
    env: { ...process.env, HELIUS_API_KEY: heliusApiKey },
    stdio: 'pipe',
    windowsHide: true,
    shell: process.platform === 'win32',
  }) as ChildProcessWithoutNullStreams

  ricoMapsProcess = child

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) lastError = text.slice(-600)
  })
  child.on('error', (error: Error) => {
    lastError = error.message
  })
  child.on('exit', () => {
    if (ricoMapsProcess === child) ricoMapsProcess = null
  })

  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (await isRicoMapsRunning()) return getRicoMapsEmbedStatus()
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(lastError ?? 'RicoMaps did not start before the timeout')
}
