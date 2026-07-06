/**
 * Game Studio tools — the connective tissue for the "build me a Solana game"
 * live flow. ARIA orchestrates: scaffold a game project, launch a swarm lane to
 * author the game (via the existing swarm_launch), merge the finished lane, run
 * the dev server, preview it in-app, and trigger a pre-wired deploy.
 *
 * Design boundary (matches toolCatalog.ts): NO raw shell. run_dev_server runs
 * only a dev/start script DISCOVERED from package.json (CheckRunnerService), and
 * arbitrary code generation stays inside sandboxed swarm lanes. Terminal + port
 * side effects go through the renderer via uiEffects, mirroring ProjectStarter.
 */
import * as SwarmOrchestrator from '../../SwarmOrchestrator'
import * as PortService from '../../PortService'
import * as DeployService from '../../DeployService'
import { discoverDevScript } from '../../CheckRunnerService'
import { isPathSafe } from '../../../shared/pathValidation'
import type { AriaTool } from '../AriaTool'

const GAME_TEMPLATE_ID = 'phaser-solana-game'
// Preferred dev ports, same range ProjectStarter uses for the meme/game preview.
const PREFERRED_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]

function pickDevPort(): number {
  const taken = new Set(PortService.getRegisteredPorts().map((p) => p.port))
  return PREFERRED_PORTS.find((p) => !taken.has(p)) ?? 3011
}

export const gameStudioTools: AriaTool[] = [
  {
    name: 'scaffold_game',
    description: 'Open the DAEMON project wizard preloaded with the Solana game template (playable Phaser + TypeScript arcade with seedless wallet, cNFT assets, and policy-gated signing pre-wired). Provide a projectName. The scaffold writes the template, runs npm install + an initial git commit (so a swarm can author the game), then serves and previews it. The user confirms the target folder in the wizard.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: { projectName: { type: 'string' } },
      required: ['projectName'],
    },
    async handler(input, ctx) {
      const projectName = String(input.projectName ?? '').trim()
      if (!projectName) return { ok: false, summary: 'A projectName is required.' }
      const effect = { type: 'open_scaffold' as const, templateId: GAME_TEMPLATE_ID, projectName }
      await ctx.runUiEffect(effect, false)
      return {
        ok: true,
        summary: `Opened the game scaffold for "${projectName}". Confirm the folder in the wizard to build.`,
        uiEffect: effect,
      }
    },
  },
  {
    name: 'run_dev_server',
    description: 'Start the active project\'s dev server in a terminal and register its port so it can be previewed. Runs ONLY a dev/start/serve script found in package.json — never an arbitrary command. Returns the local URL. Use preview_app afterward to open it in the embedded browser.',
    kind: 'run',
    risk: 'write',
    async handler(_input, ctx) {
      const projectPath = ctx.snapshot.activeProjectPath
      if (!projectPath || !isPathSafe(projectPath)) {
        return { ok: false, summary: 'Open a registered project before starting a dev server.' }
      }
      const dev = discoverDevScript(projectPath)
      if (!dev) {
        return { ok: false, summary: 'No dev/start/serve script found in package.json.' }
      }
      const port = pickDevPort()
      const effect = {
        type: 'start_dev_server' as const,
        command: dev.command,
        port,
        projectPath,
        label: `Dev: ${dev.script}`,
      }
      const result = await ctx.runUiEffect(effect, true) as { ok?: boolean; url?: string; error?: string } | null
      if (!result?.ok) {
        return { ok: false, summary: result?.error ?? 'Failed to start the dev server.' }
      }
      return {
        ok: true,
        summary: `Started "${dev.command}" at ${result.url}. Preview it with preview_app.`,
        data: { url: result.url, port, script: dev.script },
      }
    },
    input: { type: 'object', properties: {} },
  },
  {
    name: 'preview_app',
    description: 'Open a running localhost app in the embedded DAEMON browser so it can be played/tested. With no port, uses the active project\'s most recently registered dev-server port. Only loopback (127.0.0.1 / localhost) is allowed.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { port: { type: 'number' } } },
    async handler(input, ctx) {
      let port = typeof input.port === 'number' ? input.port : null
      if (!port) {
        const projectId = ctx.snapshot.activeProjectId
        const registered = PortService.getRegisteredPorts()
        const mine = projectId ? registered.filter((p) => p.projectId === projectId) : registered
        port = mine.length ? mine[mine.length - 1].port : null
      }
      if (!port) {
        return { ok: false, summary: 'No dev-server port found. Start one with run_dev_server first.' }
      }
      const url = `http://127.0.0.1:${port}`
      const effect = { type: 'open_preview' as const, url }
      await ctx.runUiEffect(effect, false)
      return { ok: true, summary: `Opened ${url} in the DAEMON browser.`, uiEffect: effect, data: { url } }
    },
  },
  {
    name: 'swarm_merge_lane',
    description: 'Merge a finished swarm lane\'s work into the project\'s base branch. Commits any uncommitted lane changes onto its branch first, then merges (--no-ff) into base in the main repo. Only lanes with status "done" can be merged. On a conflict the merge is left for the Git panel to resolve.',
    kind: 'run',
    risk: 'write',
    input: { type: 'object', properties: { laneId: { type: 'string' } }, required: ['laneId'] },
    async handler(input) {
      const laneId = String(input.laneId ?? '').trim()
      if (!laneId) return { ok: false, summary: 'A laneId is required.' }
      const result = await SwarmOrchestrator.mergeLane(laneId)
      if (!result.ok) {
        return { ok: false, summary: result.error ?? `Could not merge lane ${laneId}.`, data: result }
      }
      return {
        ok: true,
        summary: `Merged ${result.branch} into ${result.baseBranch} (${result.mergedSha}).`,
        data: result,
      }
    },
  },
  {
    name: 'deploy_app',
    description: 'Deploy the active project via its pre-wired Vercel/Railway link, and report the latest deploy status + URL. This is a live/production action — it pauses for confirmation. Requires the project to be linked in the Deploy panel and pushed to a GitHub remote (redeploy triggers the provider build).',
    kind: 'run',
    risk: 'sensitive',
    input: { type: 'object', properties: {} },
    async handler(_input, ctx) {
      const projectId = ctx.snapshot.activeProjectId
      if (!projectId) return { ok: false, summary: 'Open a registered project before deploying.' }
      const infra = DeployService.getProjectInfra(projectId)
      if (!infra.vercel && !infra.railway) {
        // Surface the Deploy panel so the user can link a provider, rather than failing silently.
        await ctx.runUiEffect({ type: 'open_tool', toolId: 'deploy' }, false)
        return { ok: false, summary: 'No Vercel/Railway link yet. Opened the Deploy panel to link a provider first.' }
      }
      try {
        if (infra.vercel) {
          const token = DeployService.getToken('vercel')
          if (!token) {
            await ctx.runUiEffect({ type: 'open_tool', toolId: 'deploy' }, false)
            return { ok: false, summary: 'Vercel is linked but not authorized. Opened the Deploy panel to connect.' }
          }
          const res = await DeployService.triggerVercelRedeploy(token, infra.vercel.projectId, infra.vercel.teamId)
          await ctx.runUiEffect({ type: 'open_tool', toolId: 'deploy' }, false)
          return { ok: true, summary: `Triggered a Vercel deploy${res.url ? ` — ${res.url}` : ''}.`, data: res }
        }
        if (infra.railway) {
          const token = DeployService.getToken('railway')
          if (!token) {
            await ctx.runUiEffect({ type: 'open_tool', toolId: 'deploy' }, false)
            return { ok: false, summary: 'Railway is linked but not authorized. Opened the Deploy panel to connect.' }
          }
          const ok = await DeployService.triggerRailwayDeploy(token, infra.railway.serviceId, infra.railway.environmentId)
          await ctx.runUiEffect({ type: 'open_tool', toolId: 'deploy' }, false)
          return { ok, summary: ok ? 'Triggered a Railway deploy.' : 'Railway deploy request was not accepted.' }
        }
        return { ok: false, summary: 'No deployable provider link found.' }
      } catch (err) {
        return { ok: false, summary: err instanceof Error ? err.message : String(err) }
      }
    },
  },
]
