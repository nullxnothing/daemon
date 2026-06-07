/**
 * Token launch tools: list launchpads, preflight (read-only, MUST run first),
 * and create (sensitive, on-chain). The create handler surfaces the cluster
 * and estimated cost in its summary so the approval card is unambiguous.
 */
import * as TokenLaunchService from '../../TokenLaunchService'
import type { TokenLaunchInput, LaunchpadId } from '../../token-launch/types'
import type { AriaTool } from '../AriaTool'
import { clusterMark } from './shared'

const LAUNCHPADS = new Set<LaunchpadId>(['pumpfun', 'raydium', 'meteora', 'printr', 'openbid', 'bags', 'bonk'])

/** Build a TokenLaunchInput from loosely-typed model input, applying defaults. */
function toLaunchInput(input: Record<string, unknown>, projectId: string | null): TokenLaunchInput {
  const launchpad = String(input.launchpad ?? 'pumpfun') as LaunchpadId
  if (!LAUNCHPADS.has(launchpad)) throw new Error(`Unknown launchpad "${launchpad}".`)
  return {
    launchpad,
    walletId: String(input.walletId ?? ''),
    projectId: projectId ?? undefined,
    name: String(input.name ?? '').trim(),
    symbol: String(input.symbol ?? '').trim(),
    description: String(input.description ?? '').trim(),
    imagePath: input.imagePath ? String(input.imagePath) : null,
    twitter: input.twitter ? String(input.twitter) : undefined,
    telegram: input.telegram ? String(input.telegram) : undefined,
    website: input.website ? String(input.website) : undefined,
    initialBuySol: Number(input.initialBuySol ?? 0),
    slippageBps: Number(input.slippageBps ?? 300),
    priorityFeeSol: Number(input.priorityFeeSol ?? 0.001),
  }
}

const LAUNCH_INPUT_SCHEMA: AriaTool['input'] = {
  type: 'object',
  properties: {
    launchpad: { type: 'string' },
    walletId: { type: 'string' },
    name: { type: 'string' },
    symbol: { type: 'string' },
    description: { type: 'string' },
    imagePath: { type: 'string' },
    twitter: { type: 'string' },
    telegram: { type: 'string' },
    website: { type: 'string' },
    initialBuySol: { type: 'number' },
    slippageBps: { type: 'number' },
    priorityFeeSol: { type: 'number' },
  },
  required: ['launchpad', 'walletId', 'name', 'symbol'],
}

export const tokenLaunchTools: AriaTool[] = [
  {
    name: 'tokenlaunch_list_launchpads',
    description: 'List the available token launchpads and whether each is enabled (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      const pads = TokenLaunchService.listLaunchpads()
      return {
        ok: true,
        summary: `Found ${pads.length} launchpad(s).`,
        data: pads.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      }
    },
  },
  {
    name: 'tokenlaunch_preflight',
    description: 'Run preflight validation for a token launch (read-only). ALWAYS call this before tokenlaunch_create and show the user the estimated cost and any failing checks.',
    kind: 'read',
    risk: 'read',
    input: LAUNCH_INPUT_SCHEMA,
    async handler(input, ctx) {
      const launchInput = toLaunchInput(input, ctx.snapshot.activeProjectId)
      const preflight = await TokenLaunchService.preflightLaunch(launchInput)
      return {
        ok: true,
        summary: clusterMark(`Preflight: ${preflight.ready ? 'ready' : 'NOT ready'}, est. ${preflight.estimatedTotalSol} SOL.`),
        data: preflight,
      }
    },
  },
  {
    name: 'tokenlaunch_create',
    description: 'Create (launch) a token on-chain. Requires that tokenlaunch_preflight passed. This spends SOL and is irreversible. The user must approve.',
    kind: 'run',
    risk: 'sensitive',
    input: LAUNCH_INPUT_SCHEMA,
    async handler(input, ctx) {
      const launchInput = toLaunchInput(input, ctx.snapshot.activeProjectId)
      // Re-run preflight inside the handler so the on-chain call can never run
      // against a failing/under-funded state, regardless of what the model claims.
      const preflight = await TokenLaunchService.preflightLaunch(launchInput)
      if (!preflight.ready) {
        return { ok: false, summary: clusterMark(`Preflight not ready (est. ${preflight.estimatedTotalSol} SOL). Launch aborted.`) }
      }
      const result = await TokenLaunchService.createLaunch(launchInput)
      return {
        ok: true,
        summary: clusterMark(`Launched ${launchInput.symbol} (${result.mint}).`),
        data: { mint: result.mint, signature: result.signature, poolAddress: result.poolAddress },
      }
    },
  },
]
