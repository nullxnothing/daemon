import 'dotenv/config'
import { app, BrowserWindow, ipcMain, protocol, net, session } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDb, closeDb } from '../db/db'
import { isPathSafe } from '../shared/pathValidation'
import { registerTerminalHandlers, killAllSessions } from '../ipc/terminal'
import { registerFilesystemHandlers } from '../ipc/filesystem'
import { registerProjectHandlers } from '../ipc/projects'
import { registerAgentHandlers } from '../ipc/agents'
import { registerAgentOpsHandlers } from '../ipc/agentops'
import { registerClaudeHandlers } from '../ipc/claude'
import { registerCodexHandlers } from '../ipc/codex'
import { registerProviderHandlers } from '../ipc/provider'
import { registerActivityHandlers } from '../ipc/activity'
import { ClaudeProvider, CodexProvider, ProviderRegistry } from '../services/providers'
import { registerGitHandlers } from '../ipc/git'
import { registerProcessHandlers } from '../ipc/processes'
import { registerEnvHandlers } from '../ipc/env'
import { registerPortHandlers } from '../ipc/ports'
import { registerWalletHandlers } from '../ipc/wallet'
import { registerProHandlers } from '../ipc/pro'
import { registerDaemonAIHandlers } from '../ipc/daemon-ai'
import { registerSettingsHandlers } from '../ipc/settings'
import { registerPluginHandlers } from '../ipc/plugins'
import { registerTweetHandlers } from '../ipc/tweets'
import { registerRecoveryHandlers } from '../ipc/recovery'
import { registerEngineHandlers } from '../ipc/engine'
import { registerToolHandlers } from '../ipc/tools'
import { registerPumpFunHandlers } from '../ipc/pumpfun'
import { registerProofPoolHandlers } from '../ipc/proofPool'
import { registerClawpumpHandlers } from '../ipc/clawpump'
import { registerVenumHandlers } from '../ipc/venum'
import { registerDegenToolsHandlers } from '../ipc/degentools'
import { registerBrowserHandlers } from '../ipc/browser'
import { registerDeployHandlers } from '../ipc/deploy'
import { registerShiplineHandlers } from '../ipc/shipline'
import { registerEmailHandlers } from '../ipc/email'
import { registerImageHandlers } from '../ipc/images'
import { registerAriaHandlers } from '../ipc/aria'
import { registerHyperliquidHandlers } from '../ipc/hyperliquid'
import { registerBridgeHandlers, startBridge, stopBridge } from '../ipc/bridge'
import { registerSwarmHandlers } from '../ipc/swarm'
import { registerAutopilotHandlers } from '../ipc/autopilot'
import { start as startAutopilotScheduler, stop as stopAutopilotScheduler } from '../services/AutopilotScheduler'
import { registerMemoryHandlers } from '../ipc/memory'
import { killAll as killAllSwarmLanes, } from '../services/SwarmOrchestrator'
import { reconcileOnBoot as reconcileSwarmOnBoot } from '../services/WorktreeService'
import { registerLaunchHandlers } from '../ipc/launch'
import { registerDashboardHandlers } from '../ipc/dashboard'
import { registerForensicsHandlers } from '../ipc/forensics'
import { registerRegistryHandlers } from '../ipc/registry'
import { registerSaidHandlers } from '../ipc/said'
import { registerSynapseHandlers } from '../ipc/synapse'
import { registerAllowanceHandlers } from '../ipc/allowances'
import { registerSignalhouseHandlers } from '../ipc/signalhouse'
import { registerFlywheelHandlers } from '../ipc/flywheel'
import { registerFeeHandlers } from '../ipc/fees'
import { registerColosseumHandlers } from '../ipc/colosseum'
import { registerIdleHandlers } from '../ipc/idle'
import { registerMeterflowHandlers } from '../ipc/meterflow'
import { registerMetaplexHandlers } from '../ipc/metaplex'
import { registerVaultHandlers } from '../ipc/vault'
import { registerValidatorHandlers } from '../ipc/validator'
import { registerSeekerHandlers } from '../ipc/seeker'
import { registerPnlHandlers } from '../ipc/pnl'
import { registerFeedbackHandlers } from '../ipc/feedback'
import { registerAgentStationHandlers } from '../ipc/agentStation'
import { registerAgentEconomyHandlers } from '../ipc/agentEconomy'
import { registerReplayHandlers } from '../ipc/replay'
import { registerLspHandlers } from '../ipc/lsp'
import { registerTelemetryHandlers, initTelemetry } from '../ipc/telemetry'
import { registerVoightHandlers } from '../ipc/voight'
import { registerPackHandlers, setPackDomainRegistrar } from '../ipc/packs'
import { enabledIpcDomains, type IpcDomainId } from '../shared/packManifest'
import { flushRemoteTelemetry } from '../services/RemoteTelemetryService'
import { flushQueue as flushVoightQueue } from '../services/VoightService'
import { runAriaServer } from '../services/AriaTerminalBackendService'
import { clearLoadedWallets } from '../services/RecoveryService'
import { maybeRecoverUnstableUiState, getEnabledPacks, type UiRecoveryResult } from '../services/SettingsService'
import { getKeyEncryptionWarning, getStorageBackend } from '../services/SecureKeyService'
import { shutdownAllLspSessions } from '../services/LspService'
import { isAllowedWebviewUrl, isSafeExternalUrl, openSafeExternalUrl } from '../security/externalNavigation'
import { isTrustedSender, setTrustedIpcOrigin } from '../security/ipcSender'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
const SMOKE_TEST_MODE = process.env.DAEMON_SMOKE_TEST === '1'
const ARIA_CLI_MODE = process.argv.includes('--aria-server')
const WINDOWS_COMPOSITOR_DISABLED_FEATURES = ['EnableTransparentHwndEnlargement'] as const

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.env.DAEMON_USER_DATA_DIR) {
  app.setPath('userData', process.env.DAEMON_USER_DATA_DIR)
}

function appendChromiumDisabledFeatures(features: readonly string[]) {
  const existing = app.commandLine.hasSwitch('disable-features')
    ? app.commandLine.getSwitchValue('disable-features').split(',')
    : []
  const disabled = new Set([
    ...existing.map((feature) => feature.trim()).filter(Boolean),
    ...features,
  ])

  app.commandLine.appendSwitch('disable-features', [...disabled].join(','))
}

if (process.platform === 'win32') {
  // Keep DAEMON's frameless custom chrome off Electron 41's transparent HWND path.
  appendChromiumDisabledFeatures(WINDOWS_COMPOSITOR_DISABLED_FEATURES)
}

if (SMOKE_TEST_MODE) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DAEMON_SMOKE_CDP_PORT ?? '9333')
} else if (!ARIA_CLI_MODE && !app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// Monaco offline protocol — must be registered before app.whenReady()
// In production, Monaco workers load via this custom protocol instead of CDN
protocol.registerSchemesAsPrivileged([{
  scheme: 'monaco-editor',
  privileges: { standard: true, supportFetchAPI: true },
}, {
  scheme: 'daemon-icon',
  privileges: { standard: true, supportFetchAPI: true },
}, {
  scheme: 'minipaint',
  privileges: { standard: true, supportFetchAPI: true, allowServiceWorkers: false },
}])

if (process.platform === 'win32') app.setAppUserModelId('com.daemon.app')

function recordAppCrash(type: string, message: string, stack = '') {
  try {
    const db = getDb()
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), type, message, stack, Date.now()
    )
  } catch { /* DB may not be ready */ }
}

function stringifyDiagnostic(value: unknown) {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function recordNativeDiagnostic(type: string, details: unknown) {
  const message = stringifyDiagnostic(details)
  console.warn(`[${type}] ${message}`)
  recordAppCrash(type, message)
}

// Crash capture - write unhandled errors to app_crashes table
process.on('uncaughtException', (error) => {
  recordAppCrash('uncaughtException', error.message, error.stack ?? '')
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack ?? '' : ''
  recordAppCrash('unhandledRejection', message, stack)
})

app.on('child-process-gone', (_event, details) => {
  recordNativeDiagnostic('child-process-gone', details)
})

if (!ARIA_CLI_MODE && !SMOKE_TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let ipcRegistered = false
// Pack-owned IPC domains already registered this session. Guards against double
// ipcMain.handle (which throws) when a pack is enabled at runtime.
const registeredPackDomains = new Set<IpcDomainId>()
let startupUiRecovery: UiRecoveryResult | null = null
let shutdownStarted = false
let mainWindowShown = false
const AGENTOPS_OPEN_CHANNEL = 'agentops:open-request'
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

interface AgentOpsOpenRequest {
  asset?: string
  network?: 'solana-devnet' | 'solana-mainnet'
  service?: string
  price?: string
  sourceUrl: string
  receivedAt: string
}

let pendingAgentOpsOpenRequest: AgentOpsOpenRequest | null = null

function cleanupRuntimeState() {
  killAllSessions()
  killAllSwarmLanes()
  stopAutopilotScheduler()
  shutdownAllLspSessions()
  void stopBridge()
  clearLoadedWallets()
  closeDb()
}

function beginShutdownCleanup() {
  if (shutdownStarted) return false
  shutdownStarted = true
  cleanupRuntimeState()
  return true
}

function shutdownApp() {
  beginShutdownCleanup()
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    for (const window of windows) {
      if (!window.isDestroyed()) window.close()
    }
  } else {
    app.quit()
  }
}

function parseAgentOpsOpenUrl(value: string): AgentOpsOpenRequest | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'daemon:' || parsed.hostname !== 'agentops') return null
    if (parsed.pathname && parsed.pathname !== '/open') return null

    const networkParam = parsed.searchParams.get('network')?.trim()
    const network =
      networkParam === 'solana-mainnet' || networkParam === 'mainnet-beta' || networkParam === 'mainnet'
        ? 'solana-mainnet'
        : 'solana-devnet'

    const readParam = (name: string) => {
      const param = parsed.searchParams.get(name)?.trim()
      return param ? param.slice(0, 512) : undefined
    }

    return {
      asset: readParam('asset'),
      network,
      service: readParam('service'),
      price: readParam('price'),
      sourceUrl: value,
      receivedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function focusMainWindow() {
  const target = win
  if (!target || target.isDestroyed()) return
  if (target.isMinimized()) target.restore()
  target.focus()
}

function dispatchAgentOpsOpenRequest(payload: AgentOpsOpenRequest) {
  pendingAgentOpsOpenRequest = payload
  focusMainWindow()

  const target = win
  if (!target || target.isDestroyed() || target.webContents.isLoading()) return
  target.webContents.send(AGENTOPS_OPEN_CHANNEL, payload)
}

function dispatchInitialAgentOpsOpenRequest() {
  for (const arg of process.argv) {
    const payload = parseAgentOpsOpenUrl(arg)
    if (!payload) continue
    dispatchAgentOpsOpenRequest(payload)
    break
  }
}

function registerDaemonProtocolClient() {
  try {
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient('daemon', process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('daemon')
    }
  } catch (err) {
    console.warn('[protocol] daemon registration failed:', err instanceof Error ? err.message : String(err))
  }
}

// Registrar for each pack-owned IPC domain. Core domains are NOT here — they
// register unconditionally in registerAllIpc(). Keys match IpcDomainId in
// electron/shared/packManifest.ts.
const PACK_DOMAIN_REGISTRARS: Record<IpcDomainId, () => void> = {
  wallet: registerWalletHandlers,
  pnl: registerPnlHandlers,
  vault: registerVaultHandlers,
  launch: registerLaunchHandlers,
  pumpfun: registerPumpFunHandlers,
  proofpool: registerProofPoolHandlers,
  clawpump: registerClawpumpHandlers,
  degentools: registerDegenToolsHandlers,
  flywheel: registerFlywheelHandlers,
  swarm: registerSwarmHandlers,
  memory: registerMemoryHandlers,
  deploy: registerDeployHandlers,
  shipline: registerShiplineHandlers,
  signalhouse: registerSignalhouseHandlers,
  meterflow: registerMeterflowHandlers,
  idle: registerIdleHandlers,
  colosseum: registerColosseumHandlers,
  venum: registerVenumHandlers,
  metaplex: registerMetaplexHandlers,
  forensics: registerForensicsHandlers,
  replay: registerReplayHandlers,
  agentStation: registerAgentStationHandlers,
  images: registerImageHandlers,
  tweets: registerTweetHandlers,
}

// Register the IPC domains for every currently-enabled pack. Idempotent: a
// domain registered once stays registered for the session (disabling a pack
// flips renderer behaviour, not handler presence).
function ensurePackDomainsRegistered(enabled: Record<string, boolean>): void {
  for (const domain of enabledIpcDomains(enabled)) {
    if (registeredPackDomains.has(domain)) continue
    PACK_DOMAIN_REGISTRARS[domain]()
    registeredPackDomains.add(domain)
  }
}

function registerAllIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  // Bootstrap provider registry before any handlers that resolve providers
  ProviderRegistry.register(ClaudeProvider)
  ProviderRegistry.register(CodexProvider)

  // --- Core domains: always registered, never gated by capability packs ---
  registerTelemetryHandlers()
  registerTerminalHandlers()
  registerFilesystemHandlers()
  registerProjectHandlers()
  registerAgentHandlers()
  registerAgentOpsHandlers()
  registerClaudeHandlers()
  registerCodexHandlers()
  registerProviderHandlers()
  registerActivityHandlers()
  registerGitHandlers()
  registerProcessHandlers()
  registerEnvHandlers()
  registerPortHandlers()
  registerProHandlers()
  registerDaemonAIHandlers()
  registerSettingsHandlers()
  registerPluginHandlers()
  registerPackHandlers()
  registerRecoveryHandlers()
  registerEngineHandlers()
  registerToolHandlers()
  registerBrowserHandlers()
  registerEmailHandlers()
  registerAriaHandlers()
  registerHyperliquidHandlers()
  registerBridgeHandlers()
  registerDashboardHandlers()
  registerRegistryHandlers()
  registerSaidHandlers()
  registerSynapseHandlers()
  registerAllowanceHandlers()
  registerFeeHandlers()
  registerValidatorHandlers()
  registerSeekerHandlers()
  registerFeedbackHandlers()
  registerLspHandlers()
  registerVoightHandlers()
  registerAgentEconomyHandlers()

  // --- Pack-owned domains: registered only when their capability pack is on ---
  const enabled = getEnabledPacks()
  setPackDomainRegistrar(ensurePackDomainsRegistered)
  ensurePackDomainsRegistered(enabled)

  // Swarm worktree cleanup is an Agent-pack boot side effect — skip the fs scan
  // when the Agent pack is disabled.
  if (enabled.agent !== false) {
    void reconcileSwarmOnBoot().catch(() => {})
  }

  registerAutopilotHandlers()
  // Resume unattended trading: any mandate left armed before the last shutdown picks back up
  // on the next due tick. The action ledger is idempotent, so a tick interrupted mid-swap
  // can't double-fire on resume.
  startAutopilotScheduler()

  // Bridge server is always on (loopback + bearer token); the tool catalog
  // itself re-filters against enabled packs on every request.
  void startBridge().catch((error) => {
    console.warn('[bridge] failed to start:', error instanceof Error ? error.message : String(error))
  })

  // Window controls — raw channels (not wrapped by ipcHandler), so guard the
  // sender frame inline. Embedded/cross-origin frames must not drive the window.
  ipcMain.on('window:minimize', (event) => { if (isTrustedSender(event)) win?.minimize() })
  ipcMain.on('window:maximize', (event) => {
    if (!isTrustedSender(event)) return
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window:close', (event) => { if (isTrustedSender(event)) shutdownApp() })
  ipcMain.on('window:reload', (event) => {
    if (!isTrustedSender(event)) return
    if (!win) return
    if (VITE_DEV_SERVER_URL) {
      win.webContents.reloadIgnoringCache()
    } else {
      win.reload()
    }
  })
  ipcMain.handle('window:isMaximized', (event) => (isTrustedSender(event) ? (win?.isMaximized() ?? false) : false))

  ipcMain.handle('agentops:get-pending-open-request', (event) => (isTrustedSender(event) ? pendingAgentOpsOpenRequest : null))
  ipcMain.handle('agentops:ack-open-request', (event, receivedAt: string) => {
    if (!isTrustedSender(event)) return false
    if (pendingAgentOpsOpenRequest?.receivedAt === receivedAt) {
      pendingAgentOpsOpenRequest = null
    }
    return true
  })

  // Shell utilities
  ipcMain.handle('shell:open-external', async (event, url: string) => {
    if (!isTrustedSender(event)) return
    await openSafeExternalUrl(url)
  })
}

async function createWindow() {
  if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:start')
  // Trusted IPC origin: the Vite dev server in development, the file:// bundle in
  // production. IPC handlers reject senders whose top frame is not this origin.
  setTrustedIpcOrigin(VITE_DEV_SERVER_URL ? new URL(VITE_DEV_SERVER_URL).origin : 'file://')
  registerAllIpc()

  // CSP headers only in production — in dev, Vite serves /@react-refresh and
  // HMR websockets from localhost which a restrictive 'self' policy blocks
  if (!VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self' minipaint:; script-src 'self' minipaint: 'sha256-+1m5I+GGgMQpppazcRWmPjEueczyuTJO92jm308NkKc='; style-src 'self' 'unsafe-inline' minipaint:; img-src 'self' data: daemon-icon: minipaint:; worker-src 'self' blob: monaco-editor: minipaint:; connect-src 'self' https://*.anthropic.com https://*.helius-rpc.com https://price.jup.ag https://api.coingecko.com https://api.dexscreener.com https://connect.solflare.com https://solflare.com https://*.solflare.com; font-src 'self' minipaint:; frame-src minipaint: https://connect.solflare.com https://solflare.com https://*.solflare.com; object-src 'none'"]
        }
      })
    })
  }

  // Monaco offline: serve node_modules/monaco-editor files via custom protocol
  // Electron normalizes custom:///path → custom://path/ (host=path, pathname=/) so parse via URL.
  protocol.handle('monaco-editor', (request) => {
    const parsed = new URL(request.url)
    const relativePath = decodeURIComponent(
      (parsed.host + parsed.pathname).replace(/^\//, '').replace(/\/$/, '')
    )
    const basePath = path.resolve(process.env.APP_ROOT, 'node_modules', 'monaco-editor', 'min')
    const filePath = path.resolve(basePath, relativePath)
    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      return new Response('Forbidden: path traversal', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  protocol.handle('daemon-icon', (request) => {
    const encodedPath = request.url.replace(/^daemon-icon:\/\/\/?/, '')
    const filePath = decodeURIComponent(encodedPath)

    // Restrict to image file extensions only
    const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.webp', '.bmp', '.avif'])
    const ext = path.extname(filePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response('Forbidden: not an image file', { status: 403 })
    }

    // Only serve files from app resources, node_modules, or registered project paths
    const resolved = path.resolve(filePath)
    const appRoot = path.resolve(process.env.APP_ROOT)
    const isAppResource = resolved.startsWith(appRoot + path.sep)

    let isProjectPath = false
    try {
      isProjectPath = isPathSafe(resolved)
    } catch {
      // DB not ready — only allow app resources
    }

    if (!isAppResource && !isProjectPath) {
      return new Response('Forbidden: path outside allowed directories', { status: 403 })
    }

    return net.fetch(pathToFileURL(resolved).toString())
  })

  // miniPaint: serve vendor/miniPaint files via custom protocol.
  // URL format: minipaint://app/<path> — "app" is a fixed host that keeps relative URLs working.
  // e.g. minipaint://app/index.html loads index.html, its <script src="dist/bundle.js"> resolves
  // to minipaint://app/dist/bundle.js (host="app", pathname="/dist/bundle.js").
  protocol.handle('minipaint', (request) => {
    const parsed = new URL(request.url)
    // Strip leading slash from pathname to get the relative file path
    const relativePath = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    const basePath = path.resolve(process.env.APP_ROOT, 'vendor', 'miniPaint')
    const filePath = path.resolve(basePath, relativePath)
    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      return new Response('Forbidden: path traversal', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  mainWindowShown = false

  win = new BrowserWindow({
    title: 'DAEMON',
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    show: false,
    paintWhenInitiallyHidden: true,
    // Frameless on every platform: the in-app Titlebar draws window controls
    // (custom on Win/Linux, hiddenInset traffic lights on mac). A native frame
    // here would stack a second OS title bar on top of ours.
    frame: false,
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 14, y: 13 },
    } : {}),
    ...(process.platform === 'win32' ? { roundedCorners: false } : {}),
    backgroundColor: '#0a0a0a',
    icon: path.join(process.env.VITE_PUBLIC, 'daemon-icon.png'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })
  if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:browser-window-created')

  const showMainWindow = (reason: string) => {
    const target = win
    if (!target || target.isDestroyed() || mainWindowShown) return
    mainWindowShown = true
    if (SMOKE_TEST_MODE) console.log(`[smoke] createWindow:show:${reason}`)
    target.show()
    if (!SMOKE_TEST_MODE) target.focus()
    target.webContents.invalidate()
    setTimeout(() => {
      if (!target.isDestroyed()) target.webContents.invalidate()
    }, 100)
  }

  win.once('ready-to-show', () => showMainWindow('ready-to-show'))

  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    if (SMOKE_TEST_MODE) {
      url.searchParams.set('smoke', '1')
      if (process.env.DAEMON_SMOKE_ONBOARDING === '1') {
        url.searchParams.set('smokeOnboarding', '1')
      }
    }
    win.loadURL(url.toString())
    if (process.env.DAEMON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(indexHtml, SMOKE_TEST_MODE ? {
      query: {
        smoke: '1',
        ...(process.env.DAEMON_SMOKE_ONBOARDING === '1' ? { smokeOnboarding: '1' } : {}),
      },
    } : undefined)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void openSafeExternalUrl(url)
    return { action: 'deny' }
  })

  // Enforce security on webview creation from main process
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isAllowedWebviewUrl(params.src)) {
      event.preventDefault()
      return
    }
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    delete (webPreferences as Record<string, unknown>).preload
    delete (webPreferences as Record<string, unknown>).enableBlinkFeatures
    delete (webPreferences as Record<string, unknown>).disableBlinkFeatures
  })

  // Block navigation away from app origin (XSS defense)
  win.webContents.on('will-navigate', (event, url) => {
    const appOrigin = VITE_DEV_SERVER_URL
      ? new URL(VITE_DEV_SERVER_URL).origin
      : 'file://'
    const target = new URL(url)
    if (target.origin !== appOrigin) {
      event.preventDefault()
    }
  })

  win.on('maximize', () => win?.webContents.send('window:maximized'))
  win.on('unmaximize', () => win?.webContents.send('window:unmaximized'))
  win.webContents.on('render-process-gone', (_event, details) => {
    recordNativeDiagnostic('render-process-gone', details)
  })
  win.webContents.on('unresponsive', () => {
    recordNativeDiagnostic('renderer-unresponsive', { url: win?.webContents.getURL() })
  })
  win.webContents.on('responsive', () => {
    console.warn('[renderer-responsive]')
  })
  win.webContents.on('did-finish-load', () => {
    if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:did-finish-load')
    if (pendingAgentOpsOpenRequest) {
      win?.webContents.send(AGENTOPS_OPEN_CHANNEL, pendingAgentOpsOpenRequest)
    }
    setTimeout(() => showMainWindow('did-finish-load-fallback'), 1500)
  })
  if (SMOKE_TEST_MODE) {
    win.webContents.on('did-start-loading', () => console.log('[smoke] createWindow:did-start-loading'))
    win.webContents.on('dom-ready', () => console.log('[smoke] createWindow:dom-ready'))
    win.webContents.on('did-stop-loading', () => console.log('[smoke] createWindow:did-stop-loading'))
    win.webContents.on('unresponsive', () => console.log('[smoke] createWindow:unresponsive'))
    win.webContents.on('responsive', () => console.log('[smoke] createWindow:responsive'))
    win.webContents.on('console-message', (event) => {
      const details = event as Electron.Event<Electron.WebContentsConsoleMessageEventParams>
      console.log('[smoke] renderer:console', JSON.stringify({
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId,
      }))
    })
  }

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      const target = win
      if (!target || target.isDestroyed()) return
      try {
        const db = getDb()
        const recentCrashes = db.prepare(
          'SELECT COUNT(*) as count FROM app_crashes WHERE created_at > ?'
        ).get(Date.now() - 3600_000) as { count: number }
        startupUiRecovery = maybeRecoverUnstableUiState(recentCrashes.count)

        if (recentCrashes.count > 3) {
          target.webContents.send('crash-warning', recentCrashes.count)
        }
        if (startupUiRecovery) {
          target.webContents.send('ui-recovery-applied', startupUiRecovery)
        }
      } catch { /* table may not exist yet on first run */ }
    }, 1000)
  })
}
app.whenReady().then(async () => {
  if (SMOKE_TEST_MODE) console.log('[smoke] app:ready')
  if (ARIA_CLI_MODE) {
    ProviderRegistry.register(ClaudeProvider)
    ProviderRegistry.register(CodexProvider)
    if (process.platform === 'darwin') app.dock?.hide()
    runAriaServer(process.argv.slice(process.argv.indexOf('--aria-server')))
      .catch((err) => {
        console.error(err instanceof Error ? err.message : String(err))
        process.exitCode = 1
      })
      .finally(() => {
        cleanupRuntimeState()
        app.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
      })
    return
  }
  registerDaemonProtocolClient()
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    try {
      app.dock.setIcon(path.join(process.env.VITE_PUBLIC, 'daemon-icon.png'))
    } catch (err) {
      console.warn('[dock] setIcon failed:', err instanceof Error ? err.message : String(err))
    }
  }
  initTelemetry(app.getVersion() || '3.0.8')

  // Key-encryption health: if the OS keyring is unavailable or degraded to a
  // plaintext-equivalent backend, surface a blocking warning. SecureKeyService
  // independently refuses to store/decrypt private keys in this state.
  const keyEncryptionWarning = getKeyEncryptionWarning()
  if (keyEncryptionWarning) {
    console.warn('[secure-key]', keyEncryptionWarning, '(backend:', getStorageBackend(), ')')
    recordAppCrash('key-encryption-degraded', keyEncryptionWarning, `backend=${getStorageBackend() ?? 'n/a'}`)
  }

  createWindow().catch((err) => {
    console.error('[smoke] createWindow:error', err)
  }).then(() => {
    if (keyEncryptionWarning && win && !win.isDestroyed()) {
      win.webContents.once('did-finish-load', () => {
        win?.webContents.send('secure-key:degraded', keyEncryptionWarning)
      })
    }
  })
  dispatchInitialAgentOpsOpenRequest()
  setTimeout(() => {
    flushRemoteTelemetry().catch((err) => {
      console.warn('[telemetry] Remote telemetry startup failed:', err instanceof Error ? err.message : String(err))
    })
    flushVoightQueue().catch((err) => {
      console.warn('[voight] Queue flush failed:', err instanceof Error ? err.message : String(err))
    })
  }, 5000)

  if (app.isPackaged && process.env.DAEMON_DISABLE_AUTO_UPDATE !== '1') {
    const pkg = await import('electron-updater')
    const { autoUpdater } = pkg.default
    autoUpdater.on('error', (err: Error) => {
      console.error('[AutoUpdater] error:', err.message)
    })
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error('[AutoUpdater] checkForUpdatesAndNotify failed:', err.message)
    })
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
        console.error('[AutoUpdater] periodic check failed:', err.message)
      })
    }, 4 * 60 * 60 * 1000)
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const payload = parseAgentOpsOpenUrl(url)
  if (payload) dispatchAgentOpsOpenRequest(payload)
})

app.on('before-quit', () => {
  beginShutdownCleanup()
})

app.on('window-all-closed', () => {
  beginShutdownCleanup()
  win = null
  app.quit()
})

app.on('second-instance', (_event, argv) => {
  for (const arg of argv) {
    const payload = parseAgentOpsOpenUrl(arg)
    if (!payload) continue
    dispatchAgentOpsOpenRequest(payload)
    return
  }
  focusMainWindow()
})

app.on('activate', () => {
  if (shutdownStarted) return
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdownApp()
    process.exit(0)
  })
}
