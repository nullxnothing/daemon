#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, render, useApp, useStdin, useStdout } from 'ink'
import { themeColor, riskColor, isColorDisabled, gradient } from './aria-shared/render.mjs'
import { ARIA_DOT, ARIA_THEME_COLORS } from './aria-shared/ansi-theme.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainEntry = path.join(root, 'dist-electron', 'main', 'index.js')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const args = process.argv.slice(2)
const h = React.createElement

// Exit codes: 0 clean · 1 build-missing / runtime error · 2 bad args.
const EXIT_OK = 0
const EXIT_RUNTIME = 1

// Minimal command set used only when the backend sends no manifest (protocol
// skew / very old bundle). The live manifest replaces this on connect.
const FALLBACK_COMMANDS = [
  { name: 'help', synopsis: 'List available commands.' },
  { name: 'exit', synopsis: 'Quit the ARIA CLI.' },
  { name: 'new', synopsis: 'Start a fresh session.' },
  { name: 'clear', synopsis: 'Clear the current session.' },
  { name: 'sessions', synopsis: 'List recent sessions.' },
  { name: 'resume', synopsis: 'Resume a session by id.', args: '<id>' },
  { name: 'model', synopsis: 'Set the model lane.', args: 'auto|fast|standard|reasoning|premium' },
  { name: 'mode', synopsis: 'Switch operating mode.', args: 'plan|coding|ask' },
  { name: 'plan', synopsis: 'Toggle plan mode.', args: 'on|off' },
  { name: 'tools', synopsis: 'List the ARIA tool catalog.' },
  { name: 'status', synopsis: 'Show project status.' },
  { name: 'memory', synopsis: 'List stored facts.' },
]

function printHelpText(commands) {
  const lines = [
    'Usage: aria [message] [--cwd <path>] [--project <id>] [--session <id>] [--model <lane>] [--plan]',
    '',
    'Commands:',
    ...commands.map((cmd) => {
      const sig = `  /${cmd.name}${cmd.args ? ` ${cmd.args}` : ''}`
      return `${sig.padEnd(44)}  ${cmd.synopsis ?? ''}`
    }),
    '',
    'Flags: --help  --version  --plan',
    'Env:   NO_COLOR=1 disables ANSI color',
    '',
  ]
  console.log(lines.join('\n'))
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version)
  process.exit(EXIT_OK)
}

if (args.includes('--help') || args.includes('-h')) {
  printHelpText(FALLBACK_COMMANDS)
  process.exit(EXIT_OK)
}

if (!fs.existsSync(mainEntry)) {
  console.error('ARIA CLI is not built. Run: pnpm run build')
  process.exit(EXIT_RUNTIME)
}

function writeFrame(child, frame) {
  if (!child.stdin?.writable) return
  child.stdin.write(`${JSON.stringify(frame)}\n`)
}

function createBackend(onFrame, onExit) {
  const electronPath = require('electron')
  const child = spawn(electronPath, [mainEntry, '--aria-server', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DAEMON_ARIA_CLI: '1',
      NODE_NO_WARNINGS: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        onFrame(JSON.parse(line))
      } catch {
        onFrame({ type: 'log', level: 'warn', message: line })
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    const message = String(chunk).trim()
    if (message) onFrame({ type: 'log', level: 'warn', message })
  })

  child.on('exit', (code) => onExit(code ?? 0))
  child.on('error', (err) => onFrame({ type: 'error', message: err.message }))
  return child
}

function nextMode(mode) {
  if (mode === 'plan') return 'coding'
  if (mode === 'coding') return 'ask'
  return 'plan'
}

function formatEvent(event) {
  if (event.kind === 'tool-call') return `[${event.status}] ${event.name}${event.meta ? ` - ${event.meta}` : ''}`
  if (event.kind === 'plan') return `plan: ${event.steps.map((step) => `${step.index}.${step.status}:${step.title}`).join(' | ')}`
  if (event.kind === 'memory-recall') return `recalled ${event.recalled.length} memories`
  if (event.kind === 'memory-suggestion') return `memory: ${event.suggestion.title} - ${event.suggestion.value}`
  if (event.kind === 'action-result') return `patch ${event.status}: ${event.action}${event.meta ? ` - ${event.meta}` : ''}`
  if (event.kind === 'patch-proposal') return `patch proposal: ${event.proposal.title}`
  return null
}

function appendItem(setItems, item) {
  setItems((items) => [...items, item].slice(-200))
}

// Backend/process chatter that shouldn't reach the transcript: RPC rate-limit
// retries and npm/pnpm env warnings are noise, not operator output.
const NOISE = [/Too Many Requests/i, /Retrying after/i, /npm warn/i, /Unknown env config/i]
function isNoise(message) {
  return NOISE.some((re) => re.test(message))
}

const MODE_COLOR = { plan: 'magenta', coding: 'green', ask: 'blue' }

// One compact top line: brand · mode dot · engine/network. No banner wall.
function TopBar({ mode, modelLane, network }) {
  return h(Box, { justifyContent: 'space-between' },
    h(Box, null,
      h(Text, { color: themeColor('green'), bold: true }, 'aria'),
      h(Text, { color: themeColor('muted') }, ` v${pkg.version}`),
    ),
    h(Box, null,
      h(Text, { color: themeColor(MODE_COLOR[mode] ?? 'muted') }, `${ARIA_DOT} `),
      h(Text, { color: themeColor('text') }, mode),
      h(Text, { color: themeColor('muted') }, `   ${modelLane} · ${network}`),
    ),
  )
}

// Boot panel: ANSI Shadow ARIA wordmark with a green gradient + "by daemon"
// tagline, then a compact meta box. Shown once, collapses after first message.
function Banner({ banner }) {
  if (!banner) return null
  const meta = banner.meta
  const rows = banner.wordmark ?? []
  const noColor = isColorDisabled()
  const ramp = gradient(ARIA_THEME_COLORS.green, ARIA_THEME_COLORS.greenDark, rows.length)
  const wordmarkWidth = rows.length ? [...rows[0]].length : 0
  const metaRow = (k, v) => h(Box, { key: k },
    h(Text, { color: themeColor('muted') }, k.padEnd(9)),
    h(Text, { color: themeColor('secondary') }, v),
  )
  return h(Box, { flexDirection: 'column', marginBottom: 1 },
    h(Box, { flexDirection: 'column' },
      ...rows.map((line, i) => h(Text, { key: `w${i}`, color: noColor ? undefined : ramp[i], bold: true }, line)),
    ),
    h(Box, { width: wordmarkWidth, justifyContent: 'flex-end' },
      h(Text, { color: themeColor('muted') }, 'by daemon'),
    ),
    h(Box, { flexDirection: 'column', marginTop: 1 },
      h(Box, null,
        h(Text, { color: themeColor('muted') }, 'version'.padEnd(9)),
        h(Text, { color: themeColor('secondary') }, `v${banner.version}`),
      ),
      metaRow('project', meta.project),
      metaRow('network', meta.network),
      metaRow('wallet', meta.wallet),
    ),
  )
}

const ROLE = {
  user: { dot: 'green', text: 'text' },
  assistant: { dot: 'blue', text: 'text' },
  error: { dot: 'red', text: 'red' },
  tool: { dot: 'amber', text: 'secondary' },
  system: { dot: 'muted', text: 'muted' },
}

function Transcript({ items, height, scrollOffset }) {
  const start = Math.max(0, items.length - height - scrollOffset)
  const visible = items.slice(start, start + height)
  return h(Box, { flexDirection: 'column', height, overflow: 'hidden' },
    ...visible.map((item, index) => {
      const role = ROLE[item.role] ?? ROLE.system
      return h(Box, { key: `${start + index}` },
        h(Text, { color: themeColor(role.dot) }, `${ARIA_DOT} `),
        h(Text, { color: themeColor(role.text) }, item.text),
      )
    }),
  )
}

// Inline autocomplete hint: the single best completion, shown ghosted.
function ghostFor(input, matches) {
  if (!input.startsWith('/') || input.includes(' ') || matches.length === 0) return ''
  const head = matches[0].name
  const typed = input.slice(1)
  return head.startsWith(typed) ? head.slice(typed.length) : ''
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const WORK_WORDS = ['thinking', 'working', 'cooking', 'reasoning', 'crunching', 'wiring', 'computing']

// Claude-style working indicator: braille spinner + cycling verb + elapsed timer.
function WorkingIndicator({ tick, elapsedMs }) {
  const frame = SPINNER[tick % SPINNER.length]
  const word = WORK_WORDS[Math.floor(tick / 12) % WORK_WORDS.length]
  const secs = Math.floor(elapsedMs / 1000)
  return h(Box, null,
    h(Text, { color: themeColor('green') }, `${frame} `),
    h(Text, { color: themeColor('text') }, word),
    h(Text, { color: themeColor('muted') }, `… ${secs}s`),
  )
}

function Composer({ input, busy, pendingApproval, pendingPatch, mode, matches }) {
  const cue = pendingApproval ? { color: 'red', hint: 'type APPROVE, y, or n' }
    : pendingPatch ? { color: 'amber', hint: 'keep / run-tests / discard' }
      : { color: MODE_COLOR[mode] ?? 'green', hint: '' }
  const ghost = ghostFor(input, matches)
  return h(Box, null,
    h(Text, { color: themeColor(cue.color), bold: true }, '> '),
    input
      ? h(Box, null,
          h(Text, { color: themeColor('text') }, input),
          ghost ? h(Text, { color: themeColor('disabled') }, ghost) : null,
          h(Text, { color: themeColor('muted') }, '▏'),
        )
      : h(Text, { color: themeColor('muted') }, cue.hint || 'message  ·  / for commands'),
  )
}

function Footer({ contextUsed, scrollOffset }) {
  const hints = 'enter send · tab complete · ⇧tab mode · ^b sessions · pgup scroll'
  return h(Box, { justifyContent: 'space-between' },
    h(Text, { color: themeColor('muted') }, hints),
    h(Text, { color: themeColor('muted') }, `${scrollOffset > 0 ? `▲${scrollOffset}  ` : ''}${contextUsed}`),
  )
}

function AriaApp() {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const childRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [busyStart, setBusyStart] = useState(0)
  const [input, setInput] = useState('')
  const [items, setItems] = useState([])
  const [banner, setBanner] = useState(null)
  const [commands, setCommands] = useState(FALLBACK_COMMANDS)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [pendingApproval, setPendingApproval] = useState(null)
  const [pendingPatch, setPendingPatch] = useState(null)
  const inputRef = useRef('')
  const commandsRef = useRef(FALLBACK_COMMANDS)
  const scrollRef = useRef(0)
  const pendingApprovalRef = useRef(null)
  const pendingPatchRef = useRef(null)
  const stateRef = useRef(null)
  const [state, setState] = useState({
    mode: args.includes('--plan') ? 'plan' : 'coding',
    modelLane: 'auto',
    projectPath: process.cwd(),
    network: 'solana',
    wallet: null,
    session: null,
  })
  stateRef.current = state
  const width = stdout.columns ?? process.stdout.columns ?? 100
  const height = stdout.rows ?? process.stdout.rows ?? 30
  // Show the boot card only until the first message; then collapse it so the
  // chat gets the whole window. Chrome: topbar(1) + rule(1) + composer(1) +
  // footer(1) + the card when shown (~8).
  const showBanner = banner && items.length === 0
  const chrome = 4 + (showBanner ? 13 : 0) + (busy ? 1 : 0)
  const transcriptHeight = Math.max(3, height - chrome)

  const send = (frame) => writeFrame(childRef.current, frame)
  const setInputValue = (value) => {
    inputRef.current = value
    setInput(value)
  }
  const setScroll = (value) => {
    const clamped = Math.max(0, value)
    scrollRef.current = clamped
    setScrollOffset(clamped)
  }

  const submitText = (rawText) => {
    const text = rawText.trim()
    setInputValue('')
    setScroll(0)
    if (!text) return
    if (pendingApprovalRef.current) {
      const pending = pendingApprovalRef.current
      const answer = text.toLowerCase()
      send({ type: 'approval', id: pending.id, approved: text === 'APPROVE' || answer === 'y' || answer === 'yes' })
      pendingApprovalRef.current = null
      setPendingApproval(null)
      return
    }
    if (pendingPatchRef.current) {
      const pending = pendingPatchRef.current
      send({ type: 'patchDecision', id: pending.id, action: text })
      pendingPatchRef.current = null
      setPendingPatch(null)
      return
    }
    send({ type: 'input', text })
    if (text === '/exit' || text === '/quit') exit()
  }

  // Tab-complete a partial slash command from the live manifest.
  const completeSlash = () => {
    const value = inputRef.current
    if (!value.startsWith('/') || value.includes(' ')) return
    const partial = value.slice(1).toLowerCase()
    const matches = commandsRef.current.filter((cmd) => cmd.name.startsWith(partial))
    if (matches.length === 1) setInputValue(`/${matches[0].name} `)
  }

  const appendInput = (value) => {
    const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (!normalized.includes('\n')) {
      setInputValue(inputRef.current + normalized)
      return
    }
    const parts = normalized.split('\n')
    let nextInput = inputRef.current
    parts.forEach((part, index) => {
      nextInput += part
      if (index < parts.length - 1) {
        submitText(nextInput)
        nextInput = ''
      }
    })
    setInputValue(nextInput)
  }

  useEffect(() => {
    pendingApprovalRef.current = pendingApproval
  }, [pendingApproval])

  useEffect(() => {
    pendingPatchRef.current = pendingPatch
  }, [pendingPatch])

  // Drive the working-indicator animation only while busy (no idle redraws).
  useEffect(() => {
    if (!busy) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 120)
    return () => clearInterval(id)
  }, [busy])

  useEffect(() => {
    childRef.current = createBackend((frame) => {
      if (frame.type === 'ready') { setReady(true); return }
      if (frame.type === 'manifest') {
        commandsRef.current = frame.commands ?? FALLBACK_COMMANDS
        setCommands(frame.commands ?? FALLBACK_COMMANDS)
        return
      }
      if (frame.type === 'banner') { setBanner(frame); return }
      if (frame.type === 'state') { setState((current) => ({ ...current, ...frame })); return }
      if (frame.type === 'busy') {
        const isBusy = Boolean(frame.busy)
        setBusy(isBusy)
        if (isBusy) setBusyStart(Date.now())
        return
      }
      if (frame.type === 'user') { appendItem(setItems, { role: 'user', text: frame.text }); return }
      if (frame.type === 'response') {
        if (frame.text?.trim()) appendItem(setItems, { role: 'assistant', text: frame.text.trim() })
        return
      }
      if (frame.type === 'event') {
        const text = formatEvent(frame.event)
        if (text) appendItem(setItems, { role: 'tool', text })
        return
      }
      if (frame.type === 'tools') {
        appendItem(setItems, { role: 'system', text: formatTools(frame.tools) })
        return
      }
      if (frame.type === 'status') {
        appendItem(setItems, { role: 'system', text: formatStatus(frame.status) })
        return
      }
      if (frame.type === 'memories') {
        appendItem(setItems, { role: 'system', text: formatMemories(frame.memories) })
        return
      }
      if (frame.type === 'approval') {
        setPendingApproval(frame)
        appendItem(setItems, { role: 'system', text: `approval required: ${frame.request.name}` })
        return
      }
      if (frame.type === 'patchDecision') {
        setPendingPatch(frame)
        appendItem(setItems, { role: 'system', text: `patch decision: ${frame.proposal.title}` })
        return
      }
      if (frame.type === 'sessions') {
        const sessions = frame.sessions?.map((session) => `${session.id} ${session.title ?? '(untitled)'}`).join('\n') || '(none)'
        appendItem(setItems, { role: 'system', text: sessions })
        return
      }
      if (frame.type === 'help') {
        appendItem(setItems, { role: 'system', text: formatHelp(commandsRef.current) })
        return
      }
      if (frame.type === 'log') {
        if (isNoise(frame.message)) return
        appendItem(setItems, { role: frame.level === 'warn' ? 'error' : 'system', text: frame.message })
        return
      }
      if (frame.type === 'error') {
        if (isNoise(frame.message)) return
        appendItem(setItems, { role: 'error', text: frame.message })
        return
      }
      if (frame.type === 'exit') exit()
    }, (code) => {
      if (code !== 0) appendItem(setItems, { role: 'error', text: `backend exited with code ${code}` })
    })

    return () => {
      writeFrame(childRef.current, { type: 'exit' })
      childRef.current?.kill()
    }
  }, [])

  const { stdin, setRawMode, isRawModeSupported } = useStdin()

  useEffect(() => {
    if (!isRawModeSupported) {
      appendItem(setItems, { role: 'error', text: 'interactive input is not supported by this terminal' })
      return undefined
    }
    readline.emitKeypressEvents(stdin)
    setRawMode(true)
    const onKeypress = (value, key = {}) => {
      const keyName = key.name ?? ''
      if (key.ctrl && keyName === 'c') { send({ type: 'exit' }); exit(); return }
      if ((key.shift && keyName === 'tab') || key.sequence === '[Z') {
        send({ type: 'input', text: `/mode ${nextMode(stateRef.current?.mode ?? 'coding')}` })
        return
      }
      if (keyName === 'tab') { completeSlash(); return }
      if (keyName === 'pageup') { setScroll(scrollRef.current + Math.max(1, transcriptHeight - 2)); return }
      if (keyName === 'pagedown') { setScroll(scrollRef.current - Math.max(1, transcriptHeight - 2)); return }
      if (key.ctrl && keyName === 'b') { send({ type: 'input', text: '/sessions' }); return }
      if (key.ctrl && keyName === 't') {
        appendItem(setItems, { role: 'system', text: 'models: auto fast standard reasoning premium; use /model <lane>' })
        return
      }
      if (keyName === 'return' || keyName === 'enter') { submitText(inputRef.current); return }
      if (keyName === 'backspace' || keyName === 'delete') { setInputValue(inputRef.current.slice(0, -1)); return }
      if (value && !key.ctrl && !key.meta) appendInput(value)
    }
    stdin.on('keypress', onKeypress)
    return () => {
      stdin.off('keypress', onKeypress)
      setRawMode(false)
    }
  }, [stdin, setRawMode, isRawModeSupported, transcriptHeight])

  const contextUsed = useMemo(() => (items.reduce((sum, item) => sum + item.text.length, 0) / 1000).toFixed(1) + 'k', [items])
  const divider = '─'.repeat(Math.max(40, width - 2))
  const slashMatches = input.startsWith('/') && !input.includes(' ')
    ? commands.filter((cmd) => cmd.name.startsWith(input.slice(1).toLowerCase()))
    : []

  return h(Box, { flexDirection: 'column', paddingX: 1 },
    h(TopBar, { mode: state.mode, modelLane: state.modelLane, network: state.network ?? 'solana' }),
    h(Text, { color: themeColor('border') }, divider),
    showBanner ? h(Banner, { banner }) : null,
    h(Transcript, { items, height: transcriptHeight, scrollOffset }),
    busy ? h(WorkingIndicator, { tick, elapsedMs: Date.now() - busyStart }) : null,
    h(Composer, { input, mode: state.mode, busy, pendingApproval, pendingPatch, matches: slashMatches }),
    h(Footer, { contextUsed, scrollOffset }),
  )
}

// --- Structured-frame formatters (shared by TUI transcript + plain mode) ---

const dotFor = (risk) => isColorDisabled() ? ARIA_DOT : `\x1b[38;2;${hexParts(riskColor(risk))}m${ARIA_DOT}\x1b[0m`
function hexParts(hex) {
  if (!hex) return '110;112;111'
  return `${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}`
}

function formatHelp(commands) {
  return ['Commands:', ...commands.map((cmd) => `  /${cmd.name}${cmd.args ? ` ${cmd.args}` : ''} - ${cmd.synopsis ?? ''}`)].join('\n')
}

function formatTools(tools) {
  if (!tools?.length) return 'No tools available.'
  const byRisk = { read: [], write: [], sensitive: [] }
  for (const tool of tools) (byRisk[tool.risk] ?? byRisk.read).push(tool)
  const sections = []
  for (const risk of ['read', 'write', 'sensitive']) {
    const group = byRisk[risk]
    if (!group.length) continue
    sections.push(`${dotFor(risk)} ${risk} (${group.length})`)
    for (const tool of group) sections.push(`   ${tool.name} - ${tool.description.slice(0, 80)}`)
  }
  return sections.join('\n')
}

function formatStatus(status) {
  if (!status || typeof status !== 'object') return 'No status available.'
  const s = status
  return [
    'Project status:',
    `  project   ${s.project ?? '(none)'}`,
    `  cluster   ${s.cluster ?? '?'} (${s.rpcProvider ?? '?'})`,
    `  wallet    ${s.defaultWallet ?? '(none)'}  ·  ${s.walletCount ?? 0} wallet(s)`,
    `  helius    ${s.heliusConfigured ? 'configured' : 'not configured'}`,
    `  packs     ${(s.enabledPacks ?? []).join(', ') || '(none)'}`,
  ].join('\n')
}

function formatMemories(memories) {
  if (!memories?.length) return 'No stored facts yet for this project.'
  return ['Stored facts:', ...memories.map((m) => `  ${m.kind}: ${m.title} - ${m.value}`)].join('\n')
}

async function runPlain() {
  const inputText = fs.readFileSync(0, 'utf8')
  const lines = inputText.split(/\r?\n/).filter((line) => line.trim())
  let ready = false
  const child = createBackend((frame) => {
    if (frame.type === 'ready') {
      ready = true
      for (const line of lines) writeFrame(child, { type: 'input', text: line })
      if (lines.length === 0) writeFrame(child, { type: 'exit' })
      return
    }
    if (frame.type === 'state') { console.log(`aria ${frame.projectPath ?? ''}`); return }
    if (frame.type === 'response' && frame.text?.trim()) console.log(frame.text.trim())
    if (frame.type === 'user' && frame.text?.trim()) console.log(`> ${frame.text.trim()}`)
    if (frame.type === 'help') console.log(formatHelp(frame.commands ?? FALLBACK_COMMANDS))
    if (frame.type === 'manifest') return
    if (frame.type === 'banner') return
    if (frame.type === 'tools') console.log(formatTools(frame.tools))
    if (frame.type === 'status') console.log(formatStatus(frame.status))
    if (frame.type === 'memories') console.log(formatMemories(frame.memories))
    if (frame.type === 'sessions') console.log(frame.sessions?.map((session) => `${session.id} ${session.title ?? '(untitled)'}`).join('\n') || '(none)')
    if (frame.type === 'event') {
      const text = formatEvent(frame.event)
      if (text) console.log(text)
    }
    if (frame.type === 'log' || frame.type === 'error') console.error(frame.message)
    if (frame.type === 'approval') writeFrame(child, { type: 'approval', id: frame.id, approved: false })
    if (frame.type === 'patchDecision') writeFrame(child, { type: 'patchDecision', id: frame.id, action: 'discard' })
    if (frame.type === 'exit') writeFrame(child, { type: 'exit' })
  }, (code) => setTimeout(() => process.exit(code), 25))

  setTimeout(() => {
    if (!ready && child.exitCode === null) writeFrame(child, { type: 'exit' })
  }, 30_000)
}

const hasConsoleInput = fs.fstatSync(0).isCharacterDevice()
if (!hasConsoleInput) {
  runPlain().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(EXIT_RUNTIME)
  })
} else {
  render(h(AriaApp), { alternateScreen: true, exitOnCtrlC: true })
}
