/**
 * ARIA operator tool catalog — aggregator over domain modules in ./tools/*.
 *
 * Adding a tool = append to the relevant domain file; this file just composes
 * them. The planning/patch tools below are intercepted by AriaAgentService
 * (they drive transcript UI, not side effects) so they live here.
 *
 * Risk gating (read = auto-run · write = inline approve · sensitive = typed
 * confirm) is enforced centrally in AriaAgentService.executeTool, not here.
 */
import type { AriaTool } from './AriaTool'
import { navigationTools } from './tools/navigation'
import { settingsTools } from './tools/settings'
import { workspaceTools } from './tools/workspace'
import { walletTools } from './tools/wallet'
import { clawpumpTools } from './tools/clawpump'
import { agentStationTools } from './tools/agentStation'
import { tokenLaunchTools } from './tools/tokenLaunch'
import { flywheelTools } from './tools/flywheel'
import { gitTools } from './tools/git'
import { swarmTools } from './tools/swarm'

/** Planning + patch tools — intercepted in AriaAgentService.executeTool. */
const planningTools: AriaTool[] = [
  {
    name: 'present_plan',
    description: 'Present an ordered plan for the task BEFORE acting, as a short list of steps (3–6). Call this first whenever a request needs more than one action so the user can see the approach.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        },
      },
      required: ['steps'],
    },
    async handler() {
      return { ok: true, summary: 'Plan presented.' }
    },
  },
  {
    name: 'propose_patch',
    description: 'Propose a code change as a unified diff for the user to keep or discard. Provide a short title, a one-paragraph summary, and the unified diff (git format, paths relative to the project root). The change is NOT applied until the user approves.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        unifiedDiff: { type: 'string' },
      },
      required: ['title', 'unifiedDiff'],
    },
    async handler() {
      return { ok: true, summary: 'Patch proposed.' }
    },
  },
]

export const ARIA_TOOLS: AriaTool[] = [
  ...planningTools,
  ...navigationTools,
  ...settingsTools,
  ...workspaceTools,
  ...walletTools,
  ...clawpumpTools,
  ...agentStationTools,
  ...tokenLaunchTools,
  ...flywheelTools,
  ...gitTools,
  ...swarmTools,
]

export function getTool(name: string): AriaTool | undefined {
  return ARIA_TOOLS.find((t) => t.name === name)
}
