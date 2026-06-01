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
    body: 'Open Solana Start, Wallet, DAEMON AI, Build, Launch, Inspect, and other workspace tools from here.',
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
    body: 'Use side panels for active context, approvals, wallet signals, and project status while the main workspace stays focused.',
    placement: 'left',
  },
  {
    target: '[data-tour="statusbar"]',
    title: 'Status Bar',
    body: 'Track branch, agents, runtime status, and wallet signals without leaving the Solana workflow.',
    placement: 'top',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Quick Actions',
    body: 'Ctrl+K opens commands. Use Solana Start first when a project, wallet, RPC, build, or AI approval path is unclear.',
    placement: 'right',
  },
]
