import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { app } from 'electron'
import { getDb } from '../db/db'
import * as AriaAgentService from './AriaAgentService'
import * as SettingsService from './SettingsService'
import type { AriaTransport, AriaEmitEvent } from './AriaAgentService'
import { ARIA_TOOLS, getTool } from './aria/toolCatalog'
import type { AriaToolContext } from './aria/AriaTool'
import { getCommand, commandManifest } from './aria/cli/commandRegistry'
import type { AriaCommandActions } from './aria/cli/commandRegistry'
import { buildBanner } from './aria/cli/aria-boot-banner'
import { ARIA_THEME_COLORS, type AriaThemeColor } from './aria/cli/ansi-theme'
import type { AriaToolManifestEntry } from './aria/cli/frames'
import type {
  AriaContextSnapshot,
  AriaPatchAction,
  AriaPatchProposalLite,
  AriaSession,
  AriaToolEvent,
  DaemonAiModelLane,
  Project,
} from '../shared/types'

type AriaMode = 'plan' | 'coding' | 'ask'
type PendingKind = 'approval' | 'patch'

/** Internal tools intercepted by the agent loop, not real operator actions. */
const INTERNAL_TOOL_NAMES = new Set(['present_plan', 'propose_patch'])

interface AriaServerOptions {
  cwd: string
  projectId: string | null
  sessionId: string | null
  modelLane: DaemonAiModelLane
  mode: AriaMode
  initialPrompt: string | null
}

interface RuntimeState {
  session: AriaSession
  snapshot: AriaContextSnapshot
  modelLane: DaemonAiModelLane
  mode: AriaMode
}

interface PendingRequest {
  kind: PendingKind
  resolve: (value: boolean | AriaPatchAction) => void
}

const MODEL_LANES = new Set<DaemonAiModelLane>(['auto', 'fast', 'standard', 'reasoning', 'premium'])
const MODES = new Set<AriaMode>(['plan', 'coding', 'ask'])
const pending = new Map<string, PendingRequest>()

function emit(type: string, payload: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`)
}

function parseArgs(argv: string[]): AriaServerOptions {
  const options: AriaServerOptions = {
    cwd: process.cwd(),
    projectId: null,
    sessionId: null,
    modelLane: 'auto',
    mode: 'coding',
    initialPrompt: null,
  }
  const positional: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--aria-server') continue
    if (arg === '--cwd' && argv[i + 1]) {
      options.cwd = argv[++i]
      continue
    }
    if (arg === '--project' && argv[i + 1]) {
      options.projectId = argv[++i]
      continue
    }
    if (arg === '--session' && argv[i + 1]) {
      options.sessionId = argv[++i]
      continue
    }
    if (arg === '--model' && argv[i + 1]) {
      const lane = argv[++i] as DaemonAiModelLane
      if (!MODEL_LANES.has(lane)) throw new Error(`Unknown model lane "${lane}".`)
      options.modelLane = lane
      continue
    }
    if (arg === '--plan') {
      options.mode = 'plan'
      continue
    }
    if (arg === '--mode' && argv[i + 1]) {
      const mode = argv[++i] as AriaMode
      if (!MODES.has(mode)) throw new Error(`Unknown mode "${mode}".`)
      options.mode = mode
      continue
    }
    positional.push(arg)
  }

  options.initialPrompt = positional.join(' ').trim() || null
  return options
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
}

function getProjectById(id: string): Project | null {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined ?? null
}

function findProjectByPath(projectPath: string): Project | null {
  const normalized = normalizePath(projectPath)
  const rows = getDb().prepare('SELECT * FROM projects').all() as Project[]
  return rows.find((project) => normalizePath(project.path) === normalized) ?? null
}

function createSnapshot(project: Project | null, cwd: string, mode: AriaMode): AriaContextSnapshot {
  return {
    activeProjectId: project?.id ?? null,
    activeProjectPath: project?.path ?? cwd,
    currentPanelId: null,
    openFilePath: null,
    chips: {
      activeFile: false,
      projectTree: true,
      gitDiff: true,
      terminalLogs: false,
      // Off by default: injecting wallet context blocks every turn on a Helius
      // dashboard RPC (slow, rate-limited). The agent fetches wallet data on
      // demand via read_wallet / read_project_status when actually asked.
      walletContext: false,
      projectMemory: true,
    },
    planMode: mode === 'plan',
  }
}

function resolveSession(sessionId: string | null, projectId: string | null): AriaSession {
  if (sessionId) {
    const row = getDb().prepare('SELECT * FROM aria_sessions WHERE id = ?').get(sessionId) as AriaSession | undefined
    if (row) return row
    getDb().prepare('INSERT INTO aria_sessions (id, title, project_id) VALUES (?,?,?)')
      .run(sessionId, 'Aria terminal', projectId)
    return getDb().prepare('SELECT * FROM aria_sessions WHERE id = ?').get(sessionId) as AriaSession
  }

  return AriaAgentService.createSession(projectId, 'Aria terminal')
}

function getDefaultWalletName(): string | null {
  const row = getDb().prepare(
    'SELECT name FROM wallets ORDER BY is_default DESC, created_at ASC LIMIT 1'
  ).get() as { name: string } | undefined
  return row?.name ?? null
}

function emitState(state: RuntimeState): void {
  const infra = SettingsService.getWalletInfrastructureSettings()
  emit('state', {
    session: state.session,
    projectPath: state.snapshot.activeProjectPath,
    network: `${infra.cluster} (${infra.rpcProvider})`,
    wallet: getDefaultWalletName(),
    modelLane: state.modelLane,
    mode: state.mode,
  })
}

/** Ship the command catalog + theme tokens so the launcher generates its own UI. */
function emitManifest(): void {
  emit('manifest', {
    commands: commandManifest(),
    themeTokens: Object.keys(ARIA_THEME_COLORS) as AriaThemeColor[],
  })
}

/** Ship the boot banner computed from real version/cluster/session state. */
function emitBanner(state: RuntimeState): void {
  const infra = SettingsService.getWalletInfrastructureSettings()
  const { type: _type, ...banner } = buildBanner({
    version: app.getVersion(),
    cluster: infra.cluster,
    rpcProvider: infra.rpcProvider,
    wallet: getDefaultWalletName(),
    projectPath: state.snapshot.activeProjectPath,
    session: state.session.id,
    modelLane: state.modelLane,
    mode: state.mode,
  })
  emit('banner', banner)
}

function makeTransport(state: RuntimeState): AriaTransport {
  return {
    emit: (event: AriaEmitEvent) => emit('event', { event }),
    requestApproval: async (req) => {
      const id = crypto.randomUUID()
      emit('approval', { id, request: req })
      return new Promise<boolean>((resolve) => {
        pending.set(id, { kind: 'approval', resolve: resolve as PendingRequest['resolve'] })
      })
    },
    requestPatchDecision: async (proposal: AriaPatchProposalLite): Promise<AriaPatchAction> => {
      const id = crypto.randomUUID()
      emit('patchDecision', { id, proposal })
      return new Promise<AriaPatchAction>((resolve) => {
        pending.set(id, { kind: 'patch', resolve: resolve as PendingRequest['resolve'] })
      })
    },
    runUiEffect: async (effect) => {
      if (effect.type === 'set_active_project') {
        state.snapshot.activeProjectId = effect.projectId
        state.snapshot.activeProjectPath = effect.projectPath
        emitState(state)
        return undefined
      }
      if (effect.type === 'open_file') {
        state.snapshot.openFilePath = effect.path
        emit('log', { level: 'info', message: `Open file: ${effect.path}` })
        return undefined
      }
      emit('log', { level: 'info', message: `UI effect skipped in terminal: ${effect.type}` })
      return undefined
    },
  }
}

async function sendLine(line: string, state: RuntimeState): Promise<void> {
  emit('busy', { busy: true })
  try {
    const response = await AriaAgentService.sendMessage(
      state.session.id,
      line,
      state.snapshot,
      makeTransport(state),
      state.modelLane,
    )
    emit('response', { text: response.text, toolCalls: response.toolCalls ?? [] })
  } catch (err) {
    emit('error', { message: err instanceof Error ? err.message : String(err) })
  } finally {
    emit('busy', { busy: false })
  }
}

/** A no-op tool context for read-only catalog tools (no UI effects in the CLI). */
function toolContext(state: RuntimeState): AriaToolContext {
  return { sessionId: state.session.id, snapshot: state.snapshot, runUiEffect: async () => undefined }
}

/** Project the ARIA tool catalog for /tools (drops internal planning tools). */
function listToolCatalog(): AriaToolManifestEntry[] {
  return ARIA_TOOLS
    .filter((tool) => !INTERNAL_TOOL_NAMES.has(tool.name))
    .map((tool) => ({ name: tool.name, kind: tool.kind, risk: tool.risk, description: tool.description }))
}

async function emitStatus(state: RuntimeState): Promise<void> {
  const tool = getTool('read_project_status')
  if (!tool) return
  const result = await tool.handler({}, toolContext(state)).catch((err) => ({ ok: false, summary: String(err), data: undefined }))
  if (!result.ok) { emit('log', { level: 'warn', message: result.summary }); return }
  emit('status', { status: result.data })
}

async function emitMemories(state: RuntimeState): Promise<void> {
  const tool = getTool('recall_memories')
  if (!tool) return
  const result = await tool.handler({}, toolContext(state)).catch((err) => ({ ok: false, summary: String(err), data: undefined }))
  if (!result.ok) { emit('log', { level: 'warn', message: result.summary }); return }
  const memories = (result.data as { memories?: Array<{ kind: string; title: string; value: string }> })?.memories ?? []
  emit('memories', { memories })
}

/** State-affecting operations a command may invoke, bound to the live session. */
function makeCommandActions(state: RuntimeState): AriaCommandActions {
  return {
    exit: () => emit('exit'),
    listSessions: () => emit('sessions', {
      sessions: AriaAgentService.listSessions(state.snapshot.activeProjectId).slice(0, 20),
    }),
    resumeSession: (id) => {
      const row = getDb().prepare('SELECT * FROM aria_sessions WHERE id = ?').get(id) as AriaSession | undefined
      if (!row) return false
      state.session = row
      emitState(state)
      return true
    },
    newSession: () => {
      state.session = AriaAgentService.createSession(state.snapshot.activeProjectId, 'Aria terminal')
      emitState(state)
    },
    clearSession: () => {
      AriaAgentService.clearSession(state.session.id)
      emit('log', { level: 'info', message: 'Session cleared.' })
    },
    setModelLane: (lane) => {
      if (!MODEL_LANES.has(lane as DaemonAiModelLane)) return false
      state.modelLane = lane as DaemonAiModelLane
      emitState(state)
      return true
    },
    setMode: (mode) => {
      if (!MODES.has(mode as AriaMode)) return false
      state.mode = mode as AriaMode
      state.snapshot.planMode = state.mode === 'plan'
      emitState(state)
      return true
    },
    setPlan: (on) => {
      state.mode = on ? 'plan' : 'coding'
      state.snapshot.planMode = on
      emitState(state)
    },
    showHelp: () => emit('help'),
    listTools: () => emit('tools', { tools: listToolCatalog() }),
    showStatus: () => emitStatus(state),
    listMemories: () => emitMemories(state),
  }
}

async function handleCommand(line: string, state: RuntimeState): Promise<boolean> {
  const [name, ...rest] = line.slice(1).trim().split(/\s+/)
  const command = getCommand(name)
  if (!command) {
    emit('log', { level: 'warn', message: `Unknown command: /${name}` })
    return true
  }
  const outcome = await command.handler({
    arg: rest.join(' ').trim(),
    emit,
    actions: makeCommandActions(state),
  })
  return outcome?.continue !== false
}

async function handleInput(text: string, state: RuntimeState): Promise<boolean> {
  const line = text.trim()
  if (!line) return true
  emit('user', { text: line })
  if (line.startsWith('/')) return handleCommand(line, state)
  await sendLine(line, state)
  return true
}

function resolvePending(payload: Record<string, unknown>): boolean {
  const id = typeof payload.id === 'string' ? payload.id : ''
  const request = pending.get(id)
  if (!request) return false
  pending.delete(id)

  if (request.kind === 'approval') {
    request.resolve(Boolean(payload.approved))
    return true
  }
  const action = payload.action === 'keep' || payload.action === 'run-tests' ? payload.action : 'discard'
  request.resolve(action)
  return true
}

export async function runAriaServer(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv)
  const cwd = path.resolve(options.cwd)
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new Error(`Invalid cwd: ${cwd}`)
  }

  const project = options.projectId ? getProjectById(options.projectId) : findProjectByPath(cwd)
  const snapshot = createSnapshot(project, cwd, options.mode)
  const session = resolveSession(options.sessionId, snapshot.activeProjectId)
  const state: RuntimeState = { session, snapshot, modelLane: options.modelLane, mode: options.mode }
  emitManifest()
  emitBanner(state)
  emitState(state)
  emit('ready')
  // Warm backend resolution (provider auth check) off the critical path so the
  // first message doesn't block on a `claude --version` verify.
  void AriaAgentService.prewarmBackend()
  if (options.initialPrompt) void handleInput(options.initialPrompt, state)

  // Read fd 0 directly rather than process.stdin: under Electron's main process
  // process.stdin is not wired to the real pipe and reads as immediate EOF, which
  // would end the loop and exit the app before any frame is read.
  const stdinStream = fs.createReadStream('', { fd: 0 })
  stdinStream.on('error', () => { /* EPIPE when the parent exits; loop ends naturally */ })
  const rl = readline.createInterface({ input: stdinStream, crlfDelay: Infinity })

  // The frame loop must NOT block on a turn: an in-flight turn can pause for an
  // approval/patch decision, and that resolution arrives as a later stdin frame.
  // If we awaited handleInput here, the approval frame could never be read and the
  // turn would deadlock. So input frames run through a serialized queue (one turn
  // at a time), while approval/patchDecision/exit frames are processed inline —
  // out-of-band — even while a turn is running.
  let turnChain: Promise<void> = Promise.resolve()
  let exiting = false
  const enqueueTurn = (text: string) => {
    turnChain = turnChain.then(async () => {
      if (exiting) return
      try {
        const shouldContinue = await handleInput(text, state)
        if (!shouldContinue) { exiting = true; rl.close() }
      } catch (err) {
        emit('error', { message: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  for await (const line of rl) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(line) as Record<string, unknown>
    } catch {
      emit('error', { message: 'Invalid protocol frame.' })
      continue
    }
    if (payload.type === 'exit') {
      // Drain queued turns before exiting so piped input is fully answered.
      exiting = true
      break
    }
    if (payload.type === 'approval' || payload.type === 'patchDecision') {
      resolvePending(payload)
      continue
    }
    if (payload.type === 'input' && typeof payload.text === 'string') {
      enqueueTurn(payload.text)
    }
  }
  // Let any in-flight / queued turns settle before the process exits.
  await turnChain
}
