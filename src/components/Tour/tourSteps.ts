export interface TourStep {
  target: string
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  action?: () => void
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigation',
    body: 'Switch between panels here. Pin your most-used tools for quick access.',
    placement: 'right',
  },
  {
    target: '[data-tour="file-explorer"]',
    title: 'File Explorer',
    body: 'Browse and open project files. Toggle visibility with Ctrl+E.',
    placement: 'right',
  },
  {
    target: '[data-tour="editor"]',
    title: 'Editor',
    body: 'Monaco-powered code editor. Your main workspace in Canvas mode.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="terminal"]',
    title: 'Terminal',
    body: 'Full terminal with agent sessions. Drag the splitter to resize.',
    placement: 'top',
  },
  {
    target: '[data-tour="right-panel"]',
    title: 'Panels',
    body: 'Claude, Deploy, Email, Wallet, and more. Switch tabs at the top.',
    placement: 'left',
  },
  {
    target: '[data-tour="statusbar"]',
    title: 'Status Bar',
    body: 'Git branch, active agents, and system clock at a glance.',
    placement: 'top',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Quick Actions',
    body: 'Ctrl+K opens the Command Palette. Ctrl+Shift+A launches agents. Ctrl+Shift+G enters Grind mode (multi-agent grid).',
    placement: 'right',
  },
]
