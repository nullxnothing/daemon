export const DAEMON_SOLANA_LOGO_COLORS = {
  green: '#3ecf8e',
  purple: '#a0a0a0',
  magenta: '#6e706f',
} as const

export const DAEMON_ICON_GRADIENTS = {
  explorer: ['#a0a0a0', '#6e706f'],
  launcher: ['#a0a0a0', '#6e706f'],
  hackathon: ['#a0a0a0', '#6e706f'],
  tools: ['#3ecf8e', '#2a9d6c'],
} as const

export const DAEMON_TOOL_ACCENT_FALLBACK = '#a0a0a0'
export const DAEMON_SIDEBAR_ACCENT_FALLBACK = '#a0a0a0'

export const DAEMON_TOOL_COLORS: Record<string, string> = {
  starter: '#a0a0a0',
  git: '#a0a0a0',
  deploy: '#a0a0a0',
  env: '#a0a0a0',
  wallet: '#a0a0a0',
  email: '#a0a0a0',
  browser: '#a0a0a0',
  ports: '#a0a0a0',
  processes: '#ef5350',
  settings: '#a3aab8',
  'image-editor': '#a0a0a0',
  'solana-toolbox': '#3ecf8e',
  integrations: '#a0a0a0',
  'metaplex-demo': '#a0a0a0',
  zauth: '#e5e7eb',
  'project-readiness': '#a0a0a0',
  'token-launch': '#3ecf8e',
  'proof-pool': '#a0a0a0',
  'block-scanner': '#a0a0a0',
  'replay-engine': '#a0a0a0',
  docs: '#a0a0a0',
  dashboard: '#a0a0a0',
  sessions: '#a0a0a0',
  hackathon: '#a0a0a0',
  'daemon-ai': '#3ecf8e',
  plugins: '#cbd5e1',
  recovery: '#ef5350',
  pro: '#a0a0a0',
  activity: '#a0a0a0',
  'agent-station': '#a0a0a0',
  'agent-work': '#a0a0a0',
  clawpump: '#3ecf8e',
  degentools: '#a0a0a0',
  ricomaps: '#3ecf8e',
}

export const DAEMON_XTERM_THEME = {
  background: '#0a0a0a',
  foreground: '#f0f0f0',
  cursor: '#3ecf8e',
  selectionBackground: '#1d3329',
  black: '#0a0a0a',
  brightBlack: '#4a4c4b',
  red: '#ef5350',
  brightRed: '#ef5350',
  green: '#3ecf8e',
  brightGreen: '#3ecf8e',
  yellow: '#f0b429',
  brightYellow: '#f0b429',
  blue: '#60a5fa',
  brightBlue: '#60a5fa',
  magenta: '#a0a0a0',
  brightMagenta: '#f0f0f0',
  cyan: '#a0a0a0',
  brightCyan: '#f0f0f0',
  white: '#f0f0f0',
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
  'editor.foreground': '#f0f0f0',
  'editorLineNumber.foreground': '#4a4c4b',
  'editorLineNumber.activeForeground': '#a0a0a0',
  'editor.selectionBackground': '#1d3329',
  'editor.lineHighlightBackground': '#121414',
  'editorCursor.foreground': '#3ecf8e',
  'editorWidget.background': '#171919',
  'editorWidget.border': '#333636',
  'input.background': '#0d0f0f',
  'input.border': '#333636',
  'dropdown.background': '#171919',
  'list.hoverBackground': '#1d1f1f',
  'list.activeSelectionBackground': '#1d3329',
} as const

export const EDITOR_WELCOME_TEMPLATE_COLORS = {
  blue: '#60a5fa',
  amber: '#f0b429',
  violet: '#a0a0a0',
  pink: '#ef5350',
} as const

export const SPAWN_AGENT_PNL_COLORS = {
  positive: '#3ecf8e',
  negative: '#ef5350',
} as const

export const PUMP_FUN_CURVE_COLORS = {
  bg: '#0a0a0a',
  curveLine: '#3ecf8e',
  curveLineTop: '#3ecf8e',
  fillBottom: 'rgba(66, 240, 173, 0.06)',
  fillTop: 'rgba(62, 207, 142, 0.04)',
  dot: '#3ecf8e',
  dotGlow: 'rgba(66, 240, 173, 0.25)',
  impactBuy: 'rgba(66, 240, 173, 0.12)',
  impactSell: 'rgba(239, 83, 80, 0.12)',
  gradLine: '#333636',
  gradLabel: '#6e706f',
  priceLine: 'rgba(136, 136, 136, 0.25)',
  priceLabel: '#a0a0a0',
} as const
