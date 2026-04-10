export interface Command {
  id: string
  label: string
  shortcut?: string
  category?: string
  action: () => void
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
  } = deps

  return [
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
    {
      id: 'nav:git',
      label: 'Open Git Panel',
      category: 'Navigation',
      action: () => openWorkspaceTool('git'),
    },
    {
      id: 'nav:deploy',
      label: 'Open Deploy Panel',
      category: 'Navigation',
      action: () => openWorkspaceTool('deploy'),
    },
    {
      id: 'nav:email',
      label: 'Open Email',
      category: 'Navigation',
      action: () => openWorkspaceTool('email'),
    },
    {
      id: 'nav:env',
      label: 'Open Env Manager',
      category: 'Navigation',
      action: () => openWorkspaceTool('env'),
    },
    {
      id: 'nav:wallet',
      label: 'Open Wallet Panel',
      category: 'Navigation',
      action: () => openWorkspaceTool('wallet'),
    },
    {
      id: 'nav:starter',
      label: 'New Project from Template',
      category: 'Navigation',
      action: () => openWorkspaceTool('starter'),
    },
    {
      id: 'nav:settings',
      label: 'Open Settings',
      shortcut: 'Ctrl+,',
      category: 'Navigation',
      action: () => openWorkspaceTool('settings'),
    },
    {
      id: 'nav:ports',
      label: 'Open Ports',
      category: 'Navigation',
      action: () => openWorkspaceTool('ports'),
    },
    {
      id: 'nav:process',
      label: 'Open Processes',
      category: 'Navigation',
      action: () => openWorkspaceTool('processes'),
    },
    {
      id: 'nav:plugins',
      label: 'Open Plugins',
      category: 'Navigation',
      action: () => openWorkspaceTool('plugins'),
    },
    {
      id: 'nav:recovery',
      label: 'Open Recovery',
      category: 'Navigation',
      action: () => openWorkspaceTool('recovery'),
    },
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
      id: 'view:canvas-mode',
      label: 'Switch to Canvas Mode',
      category: 'View',
      action: () => setCenterMode('canvas'),
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
    {
      id: 'view:browser-tab',
      label: 'Toggle Browser Tab',
      shortcut: 'Ctrl+Shift+B',
      category: 'View',
      action: () => toggleBrowserTab?.(),
    },
    {
      id: 'view:dashboard-tab',
      label: 'Toggle Dashboard Tab',
      shortcut: 'Ctrl+Shift+D',
      category: 'View',
      action: () => toggleDashboardTab?.(),
    },
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
}
