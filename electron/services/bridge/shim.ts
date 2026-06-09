/**
 * DAEMON Bridge shim — the stdio MCP server external agents spawn.
 *
 * Thin by design: it advertises DAEMON's bridge tools and forwards every call
 * to the loopback bridge server in the running DAEMON app, where risk gating
 * and user approval happen. The shim holds no secrets beyond the bearer token
 * it reads from bridge.json, and it can approve nothing.
 *
 * Built standalone (vite.bridge.config.ts → dist-bridge/daemon-bridge-shim.mjs,
 * SDK bundled) and run by the system node (>= 18 for global fetch).
 * stdout is MCP protocol — log to stderr only.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { BridgeCallResult, BridgeToolDescriptor } from '../../shared/types'

const SHIM_VERSION = '1.0.0'
const TOOLS_FETCH_TIMEOUT_MS = 800
const CALL_HARD_CAP_MS = 10 * 60 * 1000
const PROGRESS_INTERVAL_MS = 10_000

const NOT_RUNNING = 'DAEMON is not running — open the DAEMON app and try again.'
const TOKEN_MISMATCH = 'Bridge token mismatch — re-register the DAEMON Bridge from DAEMON settings.'
const BUSY = 'DAEMON is busy — too many concurrent bridge calls. Try again in a moment.'

interface BridgeInfo {
  token: string
  port: number
}

function log(message: string): void {
  process.stderr.write(`[daemon-bridge-shim] ${message}\n`)
}

function bridgeInfoCandidates(): string[] {
  const fromEnv = process.env.DAEMON_BRIDGE_INFO
  const home = os.homedir()
  const roots = process.platform === 'win32'
    ? [process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')]
    : process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support')]
      : [process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')]
  const defaults = roots.flatMap((root) => [
    path.join(root, 'daemon', 'bridge', 'bridge.json'),
    path.join(root, 'DAEMON', 'bridge', 'bridge.json'),
  ])
  return fromEnv ? [fromEnv, ...defaults] : defaults
}

function readBridgeInfo(): { info: BridgeInfo; file: string } | null {
  for (const file of bridgeInfoCandidates()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<BridgeInfo>
      if (typeof parsed.token === 'string' && typeof parsed.port === 'number' && parsed.port > 0) {
        return { info: { token: parsed.token, port: parsed.port }, file }
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } finally {
    clearTimeout(timer)
  }
}

/** Live tool list from DAEMON, falling back to the snapshot written at registration. */
async function loadTools(located: { info: BridgeInfo; file: string } | null): Promise<BridgeToolDescriptor[]> {
  if (located) {
    const url = `http://127.0.0.1:${located.info.port}/bridge/tools`
    const headers = { authorization: `Bearer ${located.info.token}` }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { status, body } = await fetchJson(url, { headers }, TOOLS_FETCH_TIMEOUT_MS)
        const data = (body as { ok?: boolean; data?: BridgeToolDescriptor[] } | null)?.data
        if (status === 200 && Array.isArray(data)) {
          try {
            fs.writeFileSync(path.join(path.dirname(located.file), 'bridge-tools.json'), JSON.stringify(data, null, 2), 'utf8')
          } catch {
            // cache write is best-effort
          }
          return data
        }
      } catch {
        // retry once, then fall through to the cache
      }
    }
    try {
      const cached = JSON.parse(fs.readFileSync(path.join(path.dirname(located.file), 'bridge-tools.json'), 'utf8')) as BridgeToolDescriptor[]
      if (Array.isArray(cached)) return cached
    } catch {
      // no cache either
    }
  }
  log('no tool list available — DAEMON not reachable and no cached bridge-tools.json')
  return []
}

function describeFailure(status: number, body: unknown): string {
  if (status === 401 || status === 403 || status === 404) return TOKEN_MISMATCH
  if (status === 429) return BUSY
  const error = (body as { error?: string } | null)?.error
  return error ? `DAEMON bridge error: ${error}` : `DAEMON bridge error (HTTP ${status}).`
}

function toContent(result: BridgeCallResult): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  if (result.status === 'rejected') {
    return { content: [{ type: 'text', text: 'The user rejected this action in DAEMON.' }], isError: true }
  }
  if (result.status !== 'done') {
    return { content: [{ type: 'text', text: result.summary }], isError: true }
  }
  const detail = result.result !== undefined && result.result !== result.summary
    ? `\n${JSON.stringify(result.result, null, 2)}`
    : ''
  return { content: [{ type: 'text', text: `${result.summary}${detail}` }] }
}

async function main(): Promise<void> {
  const located = readBridgeInfo()
  if (!located) log('bridge.json not found — calls will fail until DAEMON registers the bridge')
  const tools = await loadTools(located)

  const server = new Server(
    { name: 'daemon-bridge', version: SHIM_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: `${tool.description}${tool.risk === 'read' ? '' : ' Requires user approval inside the DAEMON app.'}`,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    // Re-read per call: the port or token may have changed since the shim started.
    const live = readBridgeInfo() ?? located
    if (!live) {
      return { content: [{ type: 'text', text: NOT_RUNNING }], isError: true }
    }

    const progressToken = request.params._meta?.progressToken
    let progress = 0
    const progressTimer = progressToken === undefined ? null : setInterval(() => {
      progress += 1
      void extra.sendNotification({
        method: 'notifications/progress',
        params: { progressToken, progress, message: 'Waiting on DAEMON (approval may be pending)…' },
      }).catch(() => {})
    }, PROGRESS_INTERVAL_MS)

    try {
      const { status, body } = await fetchJson(
        `http://127.0.0.1:${live.info.port}/bridge/call`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${live.info.token}` },
          body: JSON.stringify({
            toolName: request.params.name,
            input: request.params.arguments ?? {},
            cwd: process.cwd(),
          }),
        },
        CALL_HARD_CAP_MS,
      )
      if (status !== 200) {
        return { content: [{ type: 'text', text: describeFailure(status, body) }], isError: true }
      }
      const result = (body as { data?: BridgeCallResult } | null)?.data
      if (!result || typeof result.summary !== 'string') {
        return { content: [{ type: 'text', text: 'DAEMON returned an unexpected bridge response.' }], isError: true }
      }
      return toContent(result)
    } catch {
      return { content: [{ type: 'text', text: NOT_RUNNING }], isError: true }
    } finally {
      if (progressTimer) clearInterval(progressTimer)
    }
  })

  await server.connect(new StdioServerTransport())
  log(`ready — ${tools.length} tools, target port ${located?.info.port ?? 'unknown'}`)
}

main().catch((error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
