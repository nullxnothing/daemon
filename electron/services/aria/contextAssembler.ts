/**
 * Builds the ARIA operator system prompt: the agent persona + tool-use rules,
 * plus a CONTEXT block derived from the renderer snapshot (and, in M6, enriched
 * with git/wallet/integration state gathered main-side).
 */
import * as SettingsService from '../SettingsService'
import * as WalletService from '../WalletService'
import type { AriaContextSnapshot } from './AriaTool'

const ARIA_AGENT_SYSTEM = `You are ARIA, the operator agent for the DAEMON Solana development workbench. You DRIVE the app for the user: open tools, change settings, enable integrations, scaffold files, and manage wallets — by calling tools, not by describing steps.

RULES:
- Be concise and direct. No filler, no emoji.
- For any request that needs more than one action, FIRST call present_plan with 3–6 short step titles so the user sees the approach, then execute the steps.
- Prefer doing over explaining: when the user states intent, call the matching tool.
- Read state with read_project_status / read_wallet before acting when unsure.
- Use exact ids. If you do not know an id, open the relevant tool instead of guessing.
- To change project code, call propose_patch with a unified diff (git format) rather than editing silently — the user keeps or discards it. Do not also call scaffold_file for the same change.
- Destructive or money-adjacent tools (settings, wallet, scaffolding) will pause for the user's approval — call them anyway; the user decides.
- Never invent wallet addresses, keys, or transaction actions. On-chain sends are out of scope.
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

  return `${ARIA_AGENT_SYSTEM}\n\n${lines.join('\n')}`
}
