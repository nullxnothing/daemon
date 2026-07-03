/**
 * Single command catalog for the ARIA standalone CLI. The backend dispatches
 * slash commands from this registry, and ships the metadata to the launcher as
 * a `manifest` frame so /help, autocomplete, and the footer are all generated
 * from here. Adding a command = one entry in COMMAND_REGISTRY.
 *
 * Commands are operator-local (they drive the CLI session, not on-chain side
 * effects), so they all carry the `read` risk tier; the tier is used only for
 * consistent color coding alongside the tool catalog.
 */
import type { AriaCommandManifestEntry } from './frames'

/** Outcome of a command: keep the loop running, or stop it (e.g. /exit). */
export interface AriaCommandOutcome {
  /** False ends the session loop. Defaults to true when omitted. */
  continue?: boolean
}

/**
 * Context handed to a command handler by the backend. Kept minimal and
 * behavior-shaped so the registry never imports the backend's internals.
 */
export interface AriaCommandContext {
  /** Raw argument string after the command name (trimmed). */
  arg: string
  /** Emit a protocol frame to the launcher. */
  emit: (type: string, payload?: Record<string, unknown>) => void
  /** Apply a setting/state change; resolves once state has been re-emitted. */
  actions: AriaCommandActions
}

/** The state-affecting operations a command may perform, supplied by the backend. */
export interface AriaCommandActions {
  exit: () => void
  listSessions: () => void
  resumeSession: (id: string) => boolean
  newSession: () => void
  clearSession: () => void
  setModelLane: (lane: string) => boolean
  setMode: (mode: string) => boolean
  setPlan: (on: boolean) => void
  showHelp: () => void
  listTools: () => void
  /** Async: runs a read tool then emits a frame. Await before the loop advances. */
  showStatus: () => Promise<void>
  /** Async: runs a read tool then emits a frame. Await before the loop advances. */
  listMemories: () => Promise<void>
}

export interface AriaCommand extends AriaCommandManifestEntry {
  handler: (ctx: AriaCommandContext) => AriaCommandOutcome | void | Promise<AriaCommandOutcome | void>
}

export const COMMAND_REGISTRY: AriaCommand[] = [
  {
    name: 'help',
    synopsis: 'List available commands.',
    risk: 'read',
    handler: ({ actions }) => { actions.showHelp() },
  },
  {
    name: 'exit',
    synopsis: 'Quit the ARIA CLI.',
    risk: 'read',
    handler: ({ actions }) => { actions.exit(); return { continue: false } },
  },
  {
    name: 'quit',
    synopsis: 'Quit the ARIA CLI.',
    risk: 'read',
    handler: ({ actions }) => { actions.exit(); return { continue: false } },
  },
  {
    name: 'new',
    synopsis: 'Start a fresh session.',
    risk: 'read',
    handler: ({ actions }) => { actions.newSession() },
  },
  {
    name: 'clear',
    synopsis: 'Clear the current session history.',
    risk: 'read',
    handler: ({ actions }) => { actions.clearSession() },
  },
  {
    name: 'sessions',
    synopsis: 'List recent sessions.',
    risk: 'read',
    keybinding: 'ctrl+b',
    handler: ({ actions }) => { actions.listSessions() },
  },
  {
    name: 'resume',
    synopsis: 'Resume a session by id.',
    args: '<id>',
    risk: 'read',
    handler: ({ actions, arg, emit }) => {
      if (!arg) { emit('log', { level: 'warn', message: 'Usage: /resume <sessionId>' }); return }
      if (!actions.resumeSession(arg)) emit('log', { level: 'warn', message: `Session not found: ${arg}` })
    },
  },
  {
    name: 'model',
    synopsis: 'Set the model lane.',
    args: 'auto|fast|standard|reasoning|premium',
    risk: 'read',
    keybinding: 'ctrl+t',
    handler: ({ actions, arg, emit }) => {
      if (!actions.setModelLane(arg)) emit('log', { level: 'warn', message: 'Usage: /model auto|fast|standard|reasoning|premium' })
    },
  },
  {
    name: 'mode',
    synopsis: 'Switch operating mode.',
    args: 'plan|coding|ask',
    risk: 'read',
    keybinding: 'shift+tab',
    handler: ({ actions, arg, emit }) => {
      if (!actions.setMode(arg)) emit('log', { level: 'warn', message: 'Usage: /mode plan|coding|ask' })
    },
  },
  {
    name: 'plan',
    synopsis: 'Toggle plan mode.',
    args: 'on|off',
    risk: 'read',
    handler: ({ actions, arg }) => { actions.setPlan(arg === 'on') },
  },
  {
    name: 'tools',
    synopsis: 'List the ARIA tool catalog grouped by risk.',
    risk: 'read',
    handler: ({ actions }) => { actions.listTools() },
  },
  {
    name: 'status',
    synopsis: 'Show active project, network, wallet, and packs.',
    risk: 'read',
    handler: ({ actions }) => actions.showStatus(),
  },
  {
    name: 'memory',
    synopsis: 'List durable facts stored for this project.',
    risk: 'read',
    handler: ({ actions }) => actions.listMemories(),
  },
]

const COMMAND_BY_NAME = new Map(COMMAND_REGISTRY.map((cmd) => [cmd.name, cmd]))

export function getCommand(name: string): AriaCommand | undefined {
  return COMMAND_BY_NAME.get(name)
}

/** Manifest projection (drops the handler) shipped to the launcher. */
export function commandManifest(): AriaCommandManifestEntry[] {
  return COMMAND_REGISTRY.map(({ name, synopsis, args, risk, keybinding }) => ({
    name, synopsis, args, risk, keybinding,
  }))
}
