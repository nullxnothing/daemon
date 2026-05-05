export interface Command {
  id: string
  label: string
  shortcut?: string
  category?: string
  action: () => void
}

interface ToolCommandDefinition {
  commandId: string
  label: string
  toolId: string
  shortcut?: string
}

type CenterModeSetter = (mode: string) => void
type CenterModeGetter = () => string
type VoidCallback = () => void

interface CommandDeps {
  setCenterMode: CenterModeSetter
  getCenterMode: CenterModeGetter
  toggleRightPanel: VoidCallback
  openAgentLauncher: VoidCallback
  toggleExplorer: VoidCallback
  returnToEditor: VoidCallback
  openWorkspaceTool: (tool: string) => void
  closeDrawer: VoidCallback
  toggleBrowserTab?: VoidCallback
  toggleDashboardTab?: VoidCallback
  isToolVisible?: (toolId: string) => boolean
}

export function buildCommands(deps: CommandDeps): Command[] {
  const {
    setCenterMode,
    getCenterMode,
    toggleRightPanel,
    openAgentLauncher,
    toggleExplorer,
    returnToEditor,
    openWorkspaceTool,
    closeDrawer,
    toggleBrowserTab,
    toggleDashboardTab,
    isToolVisible,
  } = deps

  const toolCommands: ToolCommandDefinition[] = [
    { commandId: 'nav:git', label: 'Open Git Panel', toolId: 'git' },
    { commandId: 'nav:deploy', label: 'Open Deploy Panel', toolId: 'deploy' },
    { commandId: 'nav:email', label: 'Open Email', toolId: 'email' },
    { commandId: 'nav:env', label: 'Open Env Manager', toolId: 'env' },
    { commandId: 'nav:wallet', label: 'Open Wallet Panel', toolId: 'wallet' },
    { commandId: 'nav:agent-work', label: 'Open Agent Work', toolId: 'agent-work' },
    { commandId: 'nav:project-readiness', label: 'Open Solana Project Readiness', toolId: 'project-readiness' },
    { commandId: 'nav:starter', label: 'New Project from Template', toolId: 'starter' },
    { commandId: 'nav:settings', label: 'Open Settings', toolId: 'settings', shortcut: 'Ctrl+,' },
    { commandId: 'nav:ports', label: 'Open Ports', toolId: 'ports' },
    { commandId: 'nav:process', label: 'Open Processes', toolId: 'processes' },
    { commandId: 'nav:plugins', label: 'Open Plugins', toolId: 'plugins' },
    { commandId: 'nav:recovery', label: 'Open Recovery', toolId: 'recovery' },
  ]

  const visibleToolCommands = toolCommands
    .filter((command) => (isToolVisible ? isToolVisible(command.toolId) : true))
    .map((command) => ({
      id: command.commandId,
      label: command.label,
      shortcut: command.shortcut,
      category: 'Navigation',
      action: () => openWorkspaceTool(command.toolId),
    }))

  const commands: Command[] = [
    // Navigation
    {
      id: 'nav:file-explorer',
      label: 'Open File Explorer',
      category: 'Navigation',
      action: () => toggleExplorer(),
    },
    {
      id: 'nav:agent-launcher',
      label: 'Open Agent Launcher',
      shortcut: 'Ctrl+Shift+A',
      category: 'Navigation',
      action: () => openAgentLauncher(),
    },
    ...visibleToolCommands,
    {
      id: 'nav:main-view',
      label: 'Return to Editor',
      category: 'Navigation',
      action: () => returnToEditor(),
    },

    // View
    {
      id: 'view:toggle-right-panel',
      label: 'Toggle Right Panel',
      shortcut: 'Ctrl+B',
      category: 'View',
      action: () => toggleRightPanel(),
    },
    {
      id: 'view:grind-mode',
      label: 'Switch to Grind Mode',
      shortcut: 'Ctrl+Shift+G',
      category: 'View',
      action: () => {
        const current = getCenterMode()
        setCenterMode(current === 'grind' ? 'canvas' : 'grind')
      },
    },
    ...(isToolVisible && !isToolVisible('browser') ? [] : [{
      id: 'view:browser-tab',
      label: 'Toggle Browser Tab',
      shortcut: 'Ctrl+Shift+B',
      category: 'View',
      action: () => toggleBrowserTab?.(),
    }]),
    ...(isToolVisible && !isToolVisible('dashboard') ? [] : [{
      id: 'view:dashboard-tab',
      label: 'Toggle Dashboard Tab',
      shortcut: 'Ctrl+Shift+D',
      category: 'View',
      action: () => toggleDashboardTab?.(),
    }]),
    {
      id: 'view:reload-window',
      label: 'Reload Window',
      shortcut: 'Ctrl+Shift+R',
      category: 'View',
      action: () => window.daemon.window.reload(),
    },

    // Agent
    {
      id: 'agent:launch',
      label: 'Launch Agent',
      shortcut: 'Ctrl+Shift+A',
      category: 'Agent',
      action: () => openAgentLauncher(),
    },
  ]

  return commands
}
