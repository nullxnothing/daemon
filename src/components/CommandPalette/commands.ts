export interface Command {
  id: string
  label: string
  shortcut?: string
  category?: string
  action: () => void
}

type PanelSetter = (panel: string) => void
type CenterModeSetter = (mode: string) => void
type CenterModeGetter = () => string
type VoidCallback = () => void

interface CommandDeps {
  setActivePanel: PanelSetter
  setCenterMode: CenterModeSetter
  getCenterMode: CenterModeGetter
  toggleRightPanel: VoidCallback
  openAgentLauncher: VoidCallback
  toggleExplorer: VoidCallback
  setDrawerTool: (tool: string) => void
}

export function buildCommands(deps: CommandDeps): Command[] {
  const {
    setActivePanel,
    setCenterMode,
    getCenterMode,
    toggleRightPanel,
    openAgentLauncher,
    toggleExplorer,
    setDrawerTool,
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
      action: () => setActivePanel('git'),
    },
    {
      id: 'nav:deploy',
      label: 'Open Deploy Panel',
      category: 'Navigation',
      action: () => setActivePanel('deploy'),
    },
    {
      id: 'nav:email',
      label: 'Open Email',
      category: 'Navigation',
      action: () => setActivePanel('email'),
    },
    {
      id: 'nav:env',
      label: 'Open Env Manager',
      category: 'Navigation',
      action: () => setActivePanel('env'),
    },
    {
      id: 'nav:wallet',
      label: 'Open Wallet Panel',
      category: 'Navigation',
      action: () => setActivePanel('wallet'),
    },
    {
      id: 'nav:settings',
      label: 'Open Settings',
      shortcut: 'Ctrl+,',
      category: 'Navigation',
      action: () => setDrawerTool('settings'),
    },
    {
      id: 'nav:ports',
      label: 'Open Ports',
      category: 'Navigation',
      action: () => setActivePanel('ports'),
    },
    {
      id: 'nav:process',
      label: 'Open Processes',
      category: 'Navigation',
      action: () => setActivePanel('process'),
    },
    {
      id: 'nav:tools',
      label: 'Open Tools',
      category: 'Navigation',
      action: () => setActivePanel('tools'),
    },
    {
      id: 'nav:plugins',
      label: 'Open Plugins',
      category: 'Navigation',
      action: () => setActivePanel('plugins'),
    },
    {
      id: 'nav:recovery',
      label: 'Open Recovery',
      category: 'Navigation',
      action: () => setActivePanel('recovery'),
    },
    {
      id: 'nav:claude',
      label: 'Open Claude Panel',
      category: 'Navigation',
      action: () => setActivePanel('claude'),
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
      id: 'view:browser-mode',
      label: 'Switch to Browser Mode',
      shortcut: 'Ctrl+Shift+B',
      category: 'View',
      action: () => {
        const current = getCenterMode()
        setCenterMode(current === 'browser' ? 'canvas' : 'browser')
      },
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
