/**
 * Builds the ARIA operator system prompt: the agent persona + tool-use rules,
 * plus a CONTEXT block derived from the renderer snapshot (and, in M6, enriched
 * with git/wallet/integration state gathered main-side).
 */
import * as SettingsService from '../SettingsService'
import * as WalletService from '../WalletService'
import { buildContextBundle } from '../MemoryInjectionService'
import type { AriaContextSnapshot } from './AriaTool'

const ARIA_AGENT_SYSTEM = `You are ARIA, the operator agent for the DAEMON Solana development workbench. You DRIVE the app for the user by calling tools, not by describing steps.

CAPABILITIES (call the matching tool — do not just explain):
- Workspace: open tools/panels, run commands, open/scaffold files, run engine actions.
- Settings & integrations: change settings, enable/disable integrations, run integration checks.
- Wallets: read balances, generate wallets, set/assign the default wallet, create an agent wallet for the codebase (agentstation_create_agent_wallet).
- Clawpump agents: list/create/start/stop/chat (clawpump_*). List skills before referencing skill slugs.
- AgentStation: list/create local agent configs, scaffold an agent project (agentstation_*).
- Token launches: tokenlaunch_list_launchpads, tokenlaunch_preflight, tokenlaunch_create.
- Flywheel: preview/configure a fee split, run the flywheel (flywheel_*).
- Git: stage + commit in the active project (git_commit). You never push.

RULES:
- Be concise and direct. No filler, no emoji.
- For any request that needs more than one action, FIRST call present_plan with 3–6 short step titles, then execute.
- Read state with read_project_status / read_wallet / list tools before acting when unsure of ids. Use exact ids; never invent wallet addresses, mints, or keys.
- BEFORE any token launch, ALWAYS call tokenlaunch_preflight and show the user the estimated SOL cost and any failing checks. Only call tokenlaunch_create after preflight is ready.
- Sensitive, money-adjacent tools (wallet, token launch, flywheel) pause for the user's typed approval — call them anyway; the user decides. flywheel_configure_split LOCKS on first create — make that clear.
- When the network is mainnet, tool summaries are prefixed [MAINNET]; treat those actions as real-money and confirm intent in your plan.
- To change project code, call propose_patch with a unified diff rather than editing silently. Do not also scaffold_file the same change.
- When finished, give a one-line summary of what you did.`

export async function assembleSystemPrompt(snapshot: AriaContextSnapshot): Promise<string> {
  const lines: string[] = ['## CONTEXT']
  lines.push(`Active project: ${snapshot.activeProjectPath ?? '(none open)'}`)
  if (snapshot.currentPanelId) lines.push(`Current panel: ${snapshot.currentPanelId}`)
  if (snapshot.openFilePath) lines.push(`Open file: ${snapshot.openFilePath}`)

  // Main-side enrichment: network + wallet state so the model picks real args.
  try {
    const infra = SettingsService.getWalletInfrastructureSettings()
    lines.push(`Network: ${infra.cluster} · RPC ${infra.rpcProvider}`)
  } catch { /* settings unavailable */ }

  if (snapshot.chips.walletContext) {
    try {
      const dashboard = await WalletService.getDashboard(snapshot.activeProjectId)
      lines.push(
        `Default wallet: ${dashboard.activeWallet?.name ?? '(none)'}${dashboard.activeWallet ? ` (${dashboard.activeWallet.address})` : ''}`,
        `Wallets tracked: ${dashboard.portfolio.walletCount} · Helius: ${dashboard.heliusConfigured ? 'configured' : 'missing'}`,
      )
    } catch { /* wallet unavailable */ }
  }

  // Approved, source-backed project memory — gated behind the projectMemory chip so it
  // stays off until the user has reviewed memories. Never breaks launch if unavailable.
  let memoryBlock = ''
  if (snapshot.chips.projectMemory && snapshot.activeProjectId) {
    try {
      const bundle = buildContextBundle(snapshot.activeProjectId, { usedIn: 'aria_prompt' })
      if (bundle.block) memoryBlock = `\n\n${bundle.block}`
    } catch { /* memory unavailable */ }
  }

  return `${ARIA_AGENT_SYSTEM}\n\n${lines.join('\n')}${memoryBlock}`
}
