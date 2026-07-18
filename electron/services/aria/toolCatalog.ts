/**
 * ARIA operator tool catalog — aggregator over domain modules in ./tools/*.
 *
 * Adding a tool = append to the relevant domain file; this file just composes
 * them. The planning/patch tools (./planningTools.ts) are intercepted by
 * AriaAgentService — they drive transcript UI, not side effects.
 *
 * Risk gating (read = auto-run · write = inline approve · sensitive = typed
 * confirm) is enforced centrally in AriaAgentService.executeTool, not here.
 *
 * DESIGN BOUNDARY — no raw shell. ARIA tools are structured by intent: command-palette
 * ids (run_command), named engine/integration actions, and unified-diff patches
 * (propose_patch, Guard-scanned via PatchProposalService). There is deliberately no
 * arbitrary-command-execution tool, so the agent can only do what is explicitly exposed.
 * Untrusted/arbitrary command execution belongs in a sandboxed swarm lane (isolated
 * worktree, push disabled, key stripped); "run my checks" belongs in CheckRunnerService
 * (deploy-safe script discovery). If a raw-shell tool is ever added, it MUST be gated by
 * a command-risk classifier before exec — reuse the dangerous-pattern set in
 * ToolApprovalService.classifyToolRisk. Never ship the tool without the guard.
 */
import type { AriaTool } from './AriaTool'
import { planningTools } from './planningTools'
import { navigationTools } from './tools/navigation'
import { settingsTools } from './tools/settings'
import { workspaceTools } from './tools/workspace'
import { walletTools } from './tools/wallet'
import { clawpumpTools } from './tools/clawpump'
import { hyperliquidTools } from './tools/hyperliquid'
import { robinhoodChainTools } from './tools/robinhoodChain'
import { forensicsTools } from './tools/forensics'
import { venumTools } from './tools/venum'
import { agentStationTools } from './tools/agentStation'
import { agentEconomyTools } from './tools/agentEconomy'
import { tokenLaunchTools } from './tools/tokenLaunch'
import { flywheelTools } from './tools/flywheel'
import { gitTools } from './tools/git'
import { swarmTools } from './tools/swarm'
import { memoryTools } from './tools/memory'
import { autopilotTools } from './tools/autopilot'
import { gameStudioTools } from './tools/gameStudio'

export const ARIA_TOOLS: AriaTool[] = [
  ...planningTools,
  ...navigationTools,
  ...settingsTools,
  ...workspaceTools,
  ...walletTools,
  ...clawpumpTools,
  ...hyperliquidTools,
  ...robinhoodChainTools,
  ...forensicsTools,
  ...venumTools,
  ...agentStationTools,
  ...agentEconomyTools,
  ...tokenLaunchTools,
  ...flywheelTools,
  ...gitTools,
  ...swarmTools,
  ...memoryTools,
  ...autopilotTools,
  ...gameStudioTools,
]

export function getTool(name: string): AriaTool | undefined {
  return ARIA_TOOLS.find((t) => t.name === name)
}
