/**
 * Applies renderer-only effects requested by ARIA operator tools. Centralizes
 * the navigation / file / terminal / integration logic (migrated out of the
 * old AriaChat.handleAction) so the agent loop can drive the UI declaratively.
 */
import type { AriaUiEffect } from '../../electron/shared/types'
import { useUIStore } from '../store/ui'
import { useWorkflowShellStore } from '../store/workflowShell'
import { useBrowserStore } from '../store/browser'

const INTEGRATION_ENABLE_STORAGE_KEY = 'daemon:integration-command-center:enabled'

/** Panels the agent may reference by short name → workspace tool id. */
const PANEL_ALIAS: Record<string, string> = {
  process: 'processes',
  images: 'image-editor',
}

function openTool(toolId: string): void {
  const ui = useUIStore.getState()
  if (toolId === 'tools') {
    useWorkflowShellStore.getState().toggleDrawer()
    return
  }
  if (toolId === 'terminal') {
    ui.setCenterMode('canvas')
    ui.setBrowserTabActive(false)
    ui.setDashboardTabActive(false)
    ui.setActiveWorkspaceTool(null)
    return
  }
  ui.openWorkspaceTool(PANEL_ALIAS[toolId] ?? toolId)
}

/** A small, safe allowlist of command ids the agent may trigger. */
function runCommand(commandId: string): void {
  const ui = useUIStore.getState()
  switch (commandId) {
    case 'view:toggle-right-panel':
      ui.setRightPanelTab(ui.rightPanelTab === 'claude' ? 'claude' : 'claude')
      break
    case 'view:grind-mode':
      ui.setCenterMode('grind')
      break
    case 'view:dashboard-tab':
      ui.setDashboardTabActive(true)
      break
    case 'view:browser-tab':
      ui.setBrowserTabActive(true)
      break
    default:
      // Unknown command id: open the closest matching tool if it looks like nav.
      if (commandId.startsWith('nav:')) openTool(commandId.slice(4))
  }
}

function openFile(absPath: string): void {
  const ui = useUIStore.getState()
  const activeProjectId = ui.activeProjectId
  if (!activeProjectId) return
  void window.daemon.fs.readFile(absPath).then((res) => {
    if (res.ok && res.data) {
      useUIStore.getState().openFile({
        path: res.data.path,
        name: absPath.split(/[\\/]/).pop() ?? 'file',
        content: res.data.content,
        projectId: activeProjectId,
      })
    }
  })
}

function setIntegrationEnabled(integrationId: string, enabled: boolean): void {
  try {
    const raw = window.localStorage.getItem(INTEGRATION_ENABLE_STORAGE_KEY)
    const ids = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    if (enabled) ids.add(integrationId)
    else ids.delete(integrationId)
    window.localStorage.setItem(INTEGRATION_ENABLE_STORAGE_KEY, JSON.stringify([...ids]))
  } catch { /* localStorage unavailable */ }
}

/** Apply a fire-and-forget ui effect. */
export function applyUiEffect(effect: AriaUiEffect): void {
  switch (effect.type) {
    case 'open_tool':
      openTool(effect.toolId)
      break
    case 'run_command':
      runCommand(effect.commandId)
      break
    case 'open_file':
      openFile(effect.path)
      break
    case 'set_active_project':
      useUIStore.getState().setActiveProject(effect.projectId, effect.projectPath)
      break
    case 'add_terminal':
      useUIStore.getState().addTerminal(
        useUIStore.getState().activeProjectId ?? '',
        effect.terminalId,
        effect.name,
        effect.agentId,
      )
      break
    case 'set_integration_enabled':
      setIntegrationEnabled(effect.integrationId, effect.enabled)
      break
    case 'run_integration':
      // Navigate to the integrations center so the user can run the check with
      // full context; headless execution needs the ICC's IntegrationContext.
      useUIStore.getState().openWorkspaceTool('integrations')
      break
    case 'open_preview':
      // Load a localhost dev-server URL in the embedded browser (BrowserMode).
      // Loopback is allowlisted by the webview security guard; remote http is not.
      useBrowserStore.getState().setUrl(effect.url)
      useUIStore.getState().openBrowserTab()
      break
    case 'start_dev_server':
      // Fire-and-forget path: kick off the dev server without awaiting the id.
      // The two-phase path (runUiEffectWithData) is preferred; it returns the port.
      void startDevServer(effect)
      break
    case 'open_scaffold':
      // Preselect the template + name, then open the ProjectStarter wizard.
      useUIStore.getState().setScaffoldPreset({ templateId: effect.templateId, projectName: effect.projectName })
      useUIStore.getState().openWorkspaceTool('starter')
      break
  }
}

/**
 * Create a PTY terminal that runs the discovered dev command, register its port,
 * and add it to the terminal store — the same flow ProjectStarter uses for the
 * meme site / game preview. Returns the created terminal id + preview url.
 */
async function startDevServer(effect: Extract<AriaUiEffect, { type: 'start_dev_server' }>): Promise<{ ok: boolean; terminalId?: string; url?: string; error?: string }> {
  const ui = useUIStore.getState()
  const activeProjectId = ui.activeProjectId
  if (!activeProjectId) return { ok: false, error: 'No active project.' }
  const startupCommand = `${effect.command} -- --host 127.0.0.1 --port ${effect.port}`
  const res = await window.daemon.terminal.create({
    cwd: effect.projectPath,
    startupCommand,
    userInitiated: true,
  })
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? 'Failed to start dev server terminal.' }
  ui.addTerminal(activeProjectId, res.data.id, effect.label, null)
  await window.daemon.ports.register(effect.port, activeProjectId, effect.label)
  ui.setCenterMode('canvas')
  return { ok: true, terminalId: res.data.id, url: `http://127.0.0.1:${effect.port}` }
}

/** Apply a two-phase effect and return data for the tool_result. */
export async function runUiEffectWithData(effect: AriaUiEffect): Promise<unknown> {
  if (effect.type === 'start_dev_server') {
    // Await terminal creation so the tool_result carries the real port/url + status.
    return startDevServer(effect)
  }
  applyUiEffect(effect)
  if (effect.type === 'run_integration') {
    return { opened: 'integrations', actionId: effect.actionId, note: 'Opened Integrations — run the check there.' }
  }
  return { ok: true }
}
