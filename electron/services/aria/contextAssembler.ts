/**
 * Builds the ARIA operator system prompt: the agent persona + tool-use rules,
 * plus a CONTEXT block derived from the renderer snapshot (and, in M6, enriched
 * with git/wallet/integration state gathered main-side).
 */
import * as SettingsService from '../SettingsService'
import * as WalletService from '../WalletService'
import { buildContextBundle } from '../MemoryInjectionService'
import { getMemory } from '../MemoryService'
import type { AriaContextSnapshot, AriaMemorySuggestionLite } from '../../shared/types'

const ARIA_AGENT_SYSTEM = `You are ARIA, the operator agent for the DAEMON Solana development workbench. You DRIVE the app for the user by calling tools, not by describing steps.

CAPABILITIES (call the matching tool — do not just explain):
- Workspace: open tools/panels, run commands, list/search/read project files, open/scaffold files, run engine actions.
- Settings & integrations: change settings, enable/disable integrations, run integration checks.
- Wallets: read balances, generate wallets, set/assign the default wallet, create an agent wallet for the codebase (agentstation_create_agent_wallet).
- Clawpump agents: list/create/start/stop/chat (clawpump_*). List skills before referencing skill slugs.
- AgentStation: list/create local agent configs, scaffold an agent project (agentstation_*).
- Token launches: tokenlaunch_list_launchpads, tokenlaunch_preflight, tokenlaunch_create.
- Flywheel: preview/configure a fee split, run the flywheel (flywheel_*).
- Git: stage + commit in the active project (git_commit). You never push.
- Memory: remember durable project facts (remember_fact), list what you know (recall_memories), correct or forget them (update_memory / forget_memory). Never store secrets.

RULES:
- When the user tells you to remember something, or a stable project convention is established (package manager, a constraint, a fix that should not be repeated), call remember_fact. If unsure whether a fact is already known, recall_memories first. Never remember secrets — keys, seed phrases, credentials.
- Be concise and direct. No filler, no emoji.
- Format with markdown: bold section titles (no trailing colons — the weight signals the heading) and "-" bullets for lists. Keep prose in short paragraphs.
- For any request that needs more than one action, FIRST call present_plan with 3–6 short step titles, then execute. In Plan mode, present_plan pauses for the user's approval before any write action — once approved, execute every step without pausing again (money/key actions will still ask for their own typed confirm). If the user declines the plan, stop and ask how to adjust.
- Read state with read_project_status / read_wallet / list_project_tree / read_file / search_files before acting when unsure. Use exact ids and paths; never invent wallet addresses, mints, keys, or filenames.
- Never claim you lack directory-listing, file-search, or file-reading ability. Use list_project_tree, search_files, and read_file; if a tool fails, report the tool error.
- When the user asks what you know about the repo/project, or asks for project status, immediately call read_project_status and recall_memories. Do not ask whether to pull status or memories first.
- When the user asks what files exist, immediately call list_project_tree. Do not ask the user to name a file unless they want a specific file opened.
- When the user provides a project directory path, call activate_project with that path first. Then continue with the requested status, memory, or file operation using the new active project.
- BEFORE any token launch, ALWAYS call tokenlaunch_preflight and show the user the estimated SOL cost and any failing checks. Only call tokenlaunch_create after preflight is ready.
- Sensitive, money-adjacent tools (wallet, token launch, flywheel) pause for the user's typed approval — call them anyway; the user decides. flywheel_configure_split LOCKS on first create — make that clear.
- When the network is mainnet, tool summaries are prefixed [MAINNET]; treat those actions as real-money and confirm intent in your plan.
- To change project code, call propose_patch with a unified diff rather than editing silently. Do not also scaffold_file the same change.
- When finished, give a one-line summary of what you did.`

export interface AssembledPrompt {
  system: string
  /** Memories actually injected into this prompt — surfaced as "recalled" in the transcript. */
  recalled: AriaMemorySuggestionLite[]
}

export async function assembleSystemPrompt(snapshot: AriaContextSnapshot): Promise<AssembledPrompt> {
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
  const recalled: AriaMemorySuggestionLite[] = []
  if (snapshot.chips.projectMemory && snapshot.activeProjectId) {
    try {
      const bundle = buildContextBundle(snapshot.activeProjectId, { usedIn: 'aria_prompt' })
      if (bundle.block) memoryBlock = `\n\n${bundle.block}`
      for (const id of bundle.usedMemoryIds) {
        const mem = getMemory(id)
        if (mem) recalled.push({ id: mem.id, kind: mem.kind, title: mem.title, value: mem.value })
      }
    } catch { /* memory unavailable */ }
  }

  return { system: `${ARIA_AGENT_SYSTEM}\n\n${lines.join('\n')}${memoryBlock}`, recalled }
}
