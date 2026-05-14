export const DAEMON_SOLANA_LOGO_COLORS = {
  green: '#00FFA3',
  purple: '#9945FF',
  magenta: '#DC1FFF',
} as const

export const DAEMON_ICON_GRADIENTS = {
  explorer: ['#7bc4ff', '#60a5fa'],
  launcher: ['#a78bfa', '#38bdf8'],
  hackathon: ['#ffd84d', '#f59e0b'],
  tools: ['#14f195', '#2dd4bf'],
} as const

export const DAEMON_TOOL_ACCENT_FALLBACK = '#3ecf8e'
export const DAEMON_SIDEBAR_ACCENT_FALLBACK = '#8f98a8'

export const DAEMON_TOOL_COLORS: Record<string, string> = {
  starter: '#7dd3fc',
  git: '#a78bfa',
  deploy: '#60a5fa',
  env: '#f6c768',
  wallet: '#f0abfc',
  email: '#fb923c',
  browser: '#60a5fa',
  ports: '#67e8f9',
  processes: '#f87171',
  settings: '#a3aab8',
  'image-editor': '#d8b4fe',
  'solana-toolbox': '#14f195',
  integrations: '#5eead4',
  zauth: '#e5e7eb',
  'project-readiness': '#86efac',
  'token-launch': '#34d399',
  'block-scanner': '#38bdf8',
  'replay-engine': '#7dd3fc',
  docs: '#fbbf24',
  dashboard: '#22c55e',
  sessions: '#38bdf8',
  hackathon: '#facc15',
  'daemon-ai': '#3ecf8e',
  plugins: '#cbd5e1',
  recovery: '#fb7185',
  pro: '#fde047',
  activity: '#2dd4bf',
  'agent-station': '#c4b5fd',
  'agent-work': '#38bdf8',
  spawnagents: '#c41e3a',
}

export const DAEMON_XTERM_THEME = {
  background: '#0a0a0a',
  foreground: '#ebebeb',
  cursor: '#ebebeb',
  selectionBackground: '#2a2a2a',
  black: '#0a0a0a',
  brightBlack: '#3d3d3d',
  red: '#8c4a4a',
  brightRed: '#a65c5c',
  green: '#4a8c62',
  brightGreen: '#5ca674',
  yellow: '#8c7a4a',
  brightYellow: '#a6925c',
  blue: '#4a6a8c',
  brightBlue: '#5c82a6',
  magenta: '#7a4a8c',
  brightMagenta: '#925ca6',
  cyan: '#4a8c8c',
  brightCyan: '#5ca6a6',
  white: '#ebebeb',
  brightWhite: '#ffffff',
} as const

export const DAEMON_XTERM_MINIMAL_THEME = {
  background: DAEMON_XTERM_THEME.background,
  foreground: DAEMON_XTERM_THEME.foreground,
  cursor: DAEMON_XTERM_THEME.cursor,
  selectionBackground: DAEMON_XTERM_THEME.selectionBackground,
} as const

export const DAEMON_MONACO_THEME_COLORS = {
  'editor.background': '#0a0a0a',
  'editor.foreground': '#ebebeb',
  'editorLineNumber.foreground': '#3d3d3d',
  'editorLineNumber.activeForeground': '#7a7a7a',
  'editor.selectionBackground': '#2a2a2a',
  'editor.lineHighlightBackground': '#101010',
  'editorCursor.foreground': '#ebebeb',
  'editorWidget.background': '#101010',
  'editorWidget.border': '#2a2a2a',
  'input.background': '#151515',
  'input.border': '#2a2a2a',
  'dropdown.background': '#101010',
  'list.hoverBackground': '#1a1a1a',
  'list.activeSelectionBackground': '#222222',
} as const

export const EDITOR_WELCOME_TEMPLATE_COLORS = {
  blue: '#60a5fa',
  amber: '#f0b429',
  violet: '#c084fc',
} as const

export const SPAWN_AGENT_PNL_COLORS = {
  positive: '#3fbf78',
  negative: '#ff365d',
} as const

export const PUMP_FUN_CURVE_COLORS = {
  bg: '#141414',
  curveLine: '#3ecf8e',
  curveLineTop: '#60a5fa',
  fillBottom: 'rgba(62, 207, 142, 0.06)',
  fillTop: 'rgba(96, 165, 250, 0.04)',
  dot: '#3ecf8e',
  dotGlow: 'rgba(62, 207, 142, 0.25)',
  impactBuy: 'rgba(62, 207, 142, 0.12)',
  impactSell: 'rgba(239, 83, 80, 0.12)',
  gradLine: '#333333',
  gradLabel: '#666666',
  priceLine: 'rgba(136, 136, 136, 0.25)',
  priceLabel: '#888888',
} as const
