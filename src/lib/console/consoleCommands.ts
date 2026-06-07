import { useUIStore } from '../../store/ui'
import { TOOL_DISPLAY_NAMES } from '../../constants/toolRegistry'
import { useCapabilityPacksStore } from '../../store/capabilityPacks'
import { CAPABILITY_PACKS } from '../../constants/capabilityPacks'
import { daemon } from '../daemonBridge'
import type { PackId } from '../../constants/capabilityPacks'

/**
 * The DAEMON Console is chat-first: plain text and `@context` go to the ARIA
 * agent. The `>` and `/` prefixes are quiet accelerators that surface an
 * autocomplete list of structured actions.
 *
 * - `>verb`  → workspace navigation ("go to X").
 * - `/pack`  → open a pack's host surface.
 * - `/pack verb` → run a read-only pack action and render the result inline in
 *   the transcript (no agent round-trip).
 */

export type ConsoleTrigger = '>' | '/'

export interface ConsoleCommand {
  /** Token shown after the trigger, e.g. `wallet` or `wallet balance`. */
  id: string
  trigger: ConsoleTrigger
  label: string
  hint?: string
  /** Pack id this command belongs to (for gating). Omit for always-available. */
  packId?: PackId
  /** Navigation/side-effect action. */
  run?: () => void
  /** Read-only action that returns a string rendered inline in the transcript. */
  result?: () => Promise<string>
}

function openTool(toolId: string) {
  useUIStore.getState().openWorkspaceTool(toolId)
}

// ── `>` accelerators: workspace navigation ──────────────────────────────────
const NAV_COMMANDS: ConsoleCommand[] = (
  [
    ['editor', 'Return to editor', () => useUIStore.getState().setActiveWorkspaceTool(null)],
    ['git', 'Open Git', () => openTool('git')],
    ['settings', 'Open Settings', () => openTool('settings')],
    ['packs', 'Open Capability Manager', () => openTool('plugins')],
    ['env', 'Open Env', () => openTool('env')],
    ['activity', 'Open Activity', () => openTool('activity')],
  ] as const
).map(([id, label, run]) => ({ id, trigger: '>' as const, label, run }))

// ── `/pack` accelerators: open a pack host ──────────────────────────────────
const PACK_OPEN_COMMANDS: ConsoleCommand[] = CAPABILITY_PACKS
  .filter((pack) => pack.activityBar)
  .map((pack) => ({
    id: pack.id,
    trigger: '/' as const,
    label: `Open ${pack.name}`,
    hint: TOOL_DISPLAY_NAMES[pack.activityBar!.toolId] ?? pack.activityBar!.toolId,
    packId: pack.id,
    run: () => openTool(pack.activityBar!.toolId),
  }))

// ── `/pack verb` accelerators: read-only actions with inline results ─────────
async function walletBalanceResult(): Promise<string> {
  const res = await daemon.wallet.dashboard()
  if (!res.ok || !res.data) return 'No wallet data available.'
  const { activeWallet, portfolio, wallets } = res.data
  const lines = [
    `Active wallet: ${activeWallet?.name ?? 'none'}`,
    activeWallet ? `Address: ${activeWallet.address}` : '',
    `Portfolio: $${portfolio.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    `Wallets: ${wallets.length}`,
  ].filter(Boolean)
  return lines.join('\n')
}

async function walletListResult(): Promise<string> {
  const res = await daemon.wallet.list()
  if (!res.ok || !res.data || res.data.length === 0) return 'No wallets found.'
  return res.data
    .map((w) => `${w.is_default ? '★ ' : '  '}${w.name} — ${w.address}`)
    .join('\n')
}

async function solanaClusterResult(): Promise<string> {
  const res = await daemon.settings.getWalletInfrastructureSettings()
  if (!res.ok || !res.data) return 'Cluster unknown.'
  return `Cluster: ${res.data.cluster}`
}

async function launchTokensResult(): Promise<string> {
  const list = await daemon.wallet.list()
  const defaultWallet = list.ok && list.data ? (list.data.find((w) => w.is_default) ?? list.data[0]) : null
  if (!defaultWallet) return 'No wallet to list launches for.'
  const res = await daemon.launch.listTokens(defaultWallet.id)
  if (!res.ok || !res.data || res.data.length === 0) return 'No launched tokens for the default wallet.'
  return res.data.slice(0, 10).map((t) => `${t.symbol ?? t.mint} — ${t.mint}`).join('\n')
}

const PACK_RESULT_COMMANDS: ConsoleCommand[] = [
  { id: 'wallet balance', trigger: '/', label: 'Show wallet balance', packId: 'wallet', result: walletBalanceResult },
  { id: 'wallet list', trigger: '/', label: 'List wallets', packId: 'wallet', result: walletListResult },
  { id: 'solana cluster', trigger: '/', label: 'Show active cluster', packId: 'solana', result: solanaClusterResult },
  { id: 'launch tokens', trigger: '/', label: 'List launched tokens', packId: 'launch', result: launchTokensResult },
]

const ALL_COMMANDS: ConsoleCommand[] = [...NAV_COMMANDS, ...PACK_OPEN_COMMANDS, ...PACK_RESULT_COMMANDS]

/** True when the input is a console command (starts with `>` or `/`). */
export function isConsoleCommandInput(value: string): ConsoleTrigger | null {
  const first = value.trimStart()[0]
  return first === '>' || first === '/' ? first : null
}

function packEnabled(packId?: PackId): boolean {
  if (!packId) return true
  return useCapabilityPacksStore.getState().isPackEnabled(packId)
}

/** Suggestions for the current input, filtered by trigger, query, and pack state. */
export function getConsoleSuggestions(value: string): ConsoleCommand[] {
  const trigger = isConsoleCommandInput(value)
  if (!trigger) return []
  const query = value.trimStart().slice(1).trim().toLowerCase()

  return ALL_COMMANDS
    .filter((cmd) => cmd.trigger === trigger)
    .filter((cmd) => packEnabled(cmd.packId))
    .filter((cmd) => !query || cmd.id.toLowerCase().includes(query) || cmd.label.toLowerCase().includes(query))
}

/**
 * Resolve an exact input to a command. Prefers the longest id that the input
 * starts with (so `/wallet balance` beats `/wallet`).
 */
export function resolveConsoleCommand(value: string): ConsoleCommand | null {
  const trigger = isConsoleCommandInput(value)
  if (!trigger) return null
  const query = value.trimStart().slice(1).trim().toLowerCase()
  const candidates = ALL_COMMANDS
    .filter((cmd) => cmd.trigger === trigger && packEnabled(cmd.packId))
    .filter((cmd) => query === cmd.id.toLowerCase() || query.startsWith(cmd.id.toLowerCase() + ' '))
    .sort((a, b) => b.id.length - a.id.length)
  if (candidates[0]) return candidates[0]
  // Fall back to the first prefix suggestion (typing partway and hitting enter).
  return getConsoleSuggestions(value)[0] ?? null
}
