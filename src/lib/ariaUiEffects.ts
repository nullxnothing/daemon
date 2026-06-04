/**
 * Applies renderer-only effects requested by ARIA operator tools. Centralizes
 * the navigation / file / terminal / integration logic (migrated out of the
 * old AriaChat.handleAction) so the agent loop can drive the UI declaratively.
 */
import type { AriaUiEffect } from '../../electron/shared/types'
import { useUIStore } from '../store/ui'
import { useWorkflowShellStore } from '../store/workflowShell'

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
  }
}

/** Apply a two-phase effect and return data for the tool_result. */
export async function runUiEffectWithData(effect: AriaUiEffect): Promise<unknown> {
  applyUiEffect(effect)
  if (effect.type === 'run_integration') {
    return { opened: 'integrations', actionId: effect.actionId, note: 'Opened Integrations — run the check there.' }
  }
  return { ok: true }
}
