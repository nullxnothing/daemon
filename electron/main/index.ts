import 'dotenv/config'
import { app, BrowserWindow, shell, ipcMain, protocol, net, session } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDb, closeDb } from '../db/db'
import { isPathSafe } from '../shared/pathValidation'
import { registerTerminalHandlers, killAllSessions } from '../ipc/terminal'
import { registerFilesystemHandlers } from '../ipc/filesystem'
import { registerProjectHandlers } from '../ipc/projects'
import { registerAgentHandlers } from '../ipc/agents'
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
import { registerSettingsHandlers } from '../ipc/settings'
import { registerPluginHandlers } from '../ipc/plugins'
import { registerTweetHandlers } from '../ipc/tweets'
import { registerRecoveryHandlers } from '../ipc/recovery'
import { registerEngineHandlers } from '../ipc/engine'
import { registerToolHandlers } from '../ipc/tools'
import { registerPumpFunHandlers } from '../ipc/pumpfun'
import { registerSpawnAgentsHandlers } from '../ipc/spawnagents'
import { stopEventStream as stopSpawnAgentsEventStream } from '../services/SpawnAgentsService'
import { registerBrowserHandlers } from '../ipc/browser'
import { registerDeployHandlers } from '../ipc/deploy'
import { registerEmailHandlers } from '../ipc/email'
import { registerImageHandlers } from '../ipc/images'
import { registerAriaHandlers } from '../ipc/aria'
import { registerLaunchHandlers } from '../ipc/launch'
import { registerDashboardHandlers } from '../ipc/dashboard'
import { registerRegistryHandlers } from '../ipc/registry'
import { registerColosseumHandlers } from '../ipc/colosseum'
import { registerVaultHandlers } from '../ipc/vault'
import { registerValidatorHandlers } from '../ipc/validator'
import { registerSeekerHandlers } from '../ipc/seeker'
import { registerPnlHandlers } from '../ipc/pnl'
import { registerFeedbackHandlers } from '../ipc/feedback'
import { registerAgentStationHandlers } from '../ipc/agentStation'
import { registerReplayHandlers } from '../ipc/replay'
import { registerLspHandlers } from '../ipc/lsp'
import { registerTelemetryHandlers, initTelemetry } from '../ipc/telemetry'
import { flushRemoteTelemetry } from '../services/RemoteTelemetryService'
import { clearLoadedWallets } from '../services/RecoveryService'
import { maybeRecoverUnstableUiState, type UiRecoveryResult } from '../services/SettingsService'
import { shutdownAllLspSessions } from '../services/LspService'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
const SMOKE_TEST_MODE = process.env.DAEMON_SMOKE_TEST === '1'
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
} else if (!app.isPackaged) {
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

if (!SMOKE_TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let ipcRegistered = false
let startupUiRecovery: UiRecoveryResult | null = null
let shutdownStarted = false
let mainWindowShown = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function cleanupRuntimeState() {
  killAllSessions()
  shutdownAllLspSessions()
  stopSpawnAgentsEventStream()
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

function registerAllIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  // Bootstrap provider registry before any handlers that resolve providers
  ProviderRegistry.register(ClaudeProvider)
  ProviderRegistry.register(CodexProvider)

  registerTelemetryHandlers()
  registerTerminalHandlers()
  registerFilesystemHandlers()
  registerProjectHandlers()
  registerAgentHandlers()
  registerClaudeHandlers()
  registerCodexHandlers()
  registerProviderHandlers()
  registerActivityHandlers()
  registerGitHandlers()
  registerProcessHandlers()
  registerEnvHandlers()
  registerPortHandlers()
  registerWalletHandlers()
  registerProHandlers()
  registerSettingsHandlers()
  registerPluginHandlers()
  registerTweetHandlers()
  registerRecoveryHandlers()
  registerEngineHandlers()
  registerToolHandlers()
  registerPumpFunHandlers()
  registerSpawnAgentsHandlers()
  registerBrowserHandlers()
  registerDeployHandlers()
  registerEmailHandlers()
  registerImageHandlers()
  registerAriaHandlers()
  registerLaunchHandlers()
  registerDashboardHandlers()
  registerRegistryHandlers()
  registerColosseumHandlers()
  registerVaultHandlers()
  registerValidatorHandlers()
  registerSeekerHandlers()
  registerPnlHandlers()
  registerFeedbackHandlers()
  registerAgentStationHandlers()
  registerReplayHandlers()
  registerLspHandlers()

  // Window controls
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window:close', () => shutdownApp())
  ipcMain.on('window:reload', () => {
    if (!win) return
    if (VITE_DEV_SERVER_URL) {
      win.webContents.reloadIgnoringCache()
    } else {
      win.reload()
    }
  })
  ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false)

  // Shell utilities
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') return
      if (parsed.username || parsed.password) return
      await shell.openExternal(url)
    } catch { /* invalid URL */ }
  })
}

async function createWindow() {
  if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:start')
  getDb()
  registerAllIpc()

  // CSP headers only in production — in dev, Vite serves /@react-refresh and
  // HMR websockets from localhost which a restrictive 'self' policy blocks
  if (!VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self' minipaint:; script-src 'self' minipaint: 'sha256-+1m5I+GGgMQpppazcRWmPjEueczyuTJO92jm308NkKc='; style-src 'self' 'unsafe-inline' minipaint:; img-src 'self' data: daemon-icon: minipaint:; worker-src 'self' blob: monaco-editor: minipaint:; connect-src 'self' https://*.anthropic.com https://*.helius-rpc.com https://price.jup.ag https://api.coingecko.com; font-src 'self' minipaint:; frame-src minipaint:; object-src 'none'"]
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
    frame: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
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
    }
    win.loadURL(url.toString())
    if (process.env.DAEMON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(indexHtml, SMOKE_TEST_MODE ? { query: { smoke: '1' } } : undefined)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Enforce security on webview creation from main process
  win.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    delete (webPreferences as Record<string, unknown>).preload
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
    setTimeout(() => showMainWindow('did-finish-load-fallback'), 1500)
  })
  if (SMOKE_TEST_MODE) {
    win.webContents.on('did-start-loading', () => console.log('[smoke] createWindow:did-start-loading'))
    win.webContents.on('dom-ready', () => console.log('[smoke] createWindow:dom-ready'))
    win.webContents.on('did-stop-loading', () => console.log('[smoke] createWindow:did-stop-loading'))
    win.webContents.on('unresponsive', () => console.log('[smoke] createWindow:unresponsive'))
    win.webContents.on('responsive', () => console.log('[smoke] createWindow:responsive'))
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log('[smoke] renderer:console', JSON.stringify({ level, message, line, sourceId }))
    })
  }

  // Startup crash detection — warn if >3 crashes in the last hour
  try {
    const db = getDb()
    const recentCrashes = db.prepare(
      'SELECT COUNT(*) as count FROM app_crashes WHERE created_at > ?'
    ).get(Date.now() - 3600_000) as { count: number }
    startupUiRecovery = maybeRecoverUnstableUiState(recentCrashes.count)

    if (recentCrashes.count > 3) {
      win.webContents.on('did-finish-load', () => {
        win?.webContents.send('crash-warning', recentCrashes.count)
      })
    }
    if (startupUiRecovery) {
      win.webContents.on('did-finish-load', () => {
        win?.webContents.send('ui-recovery-applied', startupUiRecovery)
      })
    }
  } catch { /* table may not exist yet on first run */ }
}
app.whenReady().then(() => {
  if (SMOKE_TEST_MODE) console.log('[smoke] app:ready')
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(path.join(process.env.VITE_PUBLIC, 'daemon-icon.png'))
    } catch (err) {
      console.warn('[dock] setIcon failed:', err instanceof Error ? err.message : String(err))
    }
  }
  initTelemetry(app.getVersion() || '3.0.8')
  flushRemoteTelemetry().catch((err) => {
    console.warn('[telemetry] Remote telemetry startup failed:', err instanceof Error ? err.message : String(err))
  })
  createWindow().catch((err) => {
    console.error('[smoke] createWindow:error', err)
  })

  if (app.isPackaged) {
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

app.on('before-quit', () => {
  beginShutdownCleanup()
})

app.on('window-all-closed', () => {
  beginShutdownCleanup()
  win = null
  app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
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
