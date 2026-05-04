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
import { registerSettingsHandlers } from '../ipc/settings'
import { registerPluginHandlers } from '../ipc/plugins'
import { registerRecoveryHandlers } from '../ipc/recovery'
import { registerEngineHandlers } from '../ipc/engine'
import { registerToolHandlers } from '../ipc/tools'
import { clearLoadedWallets } from '../services/RecoveryService'
import { maybeRecoverUnstableUiState, type UiRecoveryResult } from '../services/SettingsService'
import { shutdownAllLspSessions } from '../services/LspService'
import { trackAppLaunchTelemetry } from '../services/TelemetryService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
const SMOKE_TEST_MODE = process.env.DAEMON_SMOKE_TEST === '1'

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.env.DAEMON_USER_DATA_DIR) {
  app.setPath('userData', process.env.DAEMON_USER_DATA_DIR)
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

// --- Lazy-loading IPC handler infrastructure ---
// Phase 2A: Modules disabled by default (user enables on-demand for faster cold starts)

type LazyModuleLoader = () => Promise<{ register: () => void }>

const lazyModuleRegistry = new Map<string, LazyModuleLoader>([
  ['wallet', () => import('../ipc/wallet').then(m => ({ register: m.registerWalletHandlers }))],
  ['lsp', () => import('../ipc/lsp').then(m => ({ register: m.registerLspHandlers }))],
  ['replay', () => import('../ipc/replay').then(m => ({ register: m.registerReplayHandlers }))],
  ['pro', () => import('../ipc/pro').then(m => ({ register: m.registerProHandlers }))],
  ['images', () => import('../ipc/images').then(m => ({ register: m.registerImageHandlers }))],
  ['email', () => import('../ipc/email').then(m => ({ register: m.registerEmailHandlers }))],
  ['tweets', () => import('../ipc/tweets').then(m => ({ register: m.registerTweetHandlers }))],
  ['pumpfun', () => import('../ipc/pumpfun').then(m => ({ register: m.registerPumpFunHandlers }))],
  ['browser', () => import('../ipc/browser').then(m => ({ register: m.registerBrowserHandlers }))],
  ['deploy', () => import('../ipc/deploy').then(m => ({ register: m.registerDeployHandlers }))],
  ['aria', () => import('../ipc/aria').then(m => ({ register: m.registerAriaHandlers }))],
  ['launch', () => import('../ipc/launch').then(m => ({ register: m.registerLaunchHandlers }))],
  ['dashboard', () => import('../ipc/dashboard').then(m => ({ register: m.registerDashboardHandlers }))],
  ['registry', () => import('../ipc/registry').then(m => ({ register: m.registerRegistryHandlers }))],
  ['colosseum', () => import('../ipc/colosseum').then(m => ({ register: m.registerColosseumHandlers }))],
  ['vault', () => import('../ipc/vault').then(m => ({ register: m.registerVaultHandlers }))],
  ['validator', () => import('../ipc/validator').then(m => ({ register: m.registerValidatorHandlers }))],
  ['pnl', () => import('../ipc/pnl').then(m => ({ register: m.registerPnlHandlers }))],
  ['feedback', () => import('../ipc/feedback').then(m => ({ register: m.registerFeedbackHandlers }))],
  ['agentStation', () => import('../ipc/agentStation').then(m => ({ register: m.registerAgentStationHandlers }))],
])

const loadedModules = new Set<string>()

async function loadModuleHandlers(moduleId: string): Promise<boolean> {
  if (loadedModules.has(moduleId)) return true

  const loader = lazyModuleRegistry.get(moduleId)
  if (!loader) {
    console.warn(`[LazyLoad] Unknown module: ${moduleId}`)
    return false
  }

  try {
    const { register } = await loader()
    register()
    loadedModules.add(moduleId)
    console.log(`[LazyLoad] Loaded module: ${moduleId}`)
    return true
  } catch (err) {
    console.error(`[LazyLoad] Failed to load ${moduleId}:`, err)
    return false
  }
}

async function loadEnabledModules() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT id FROM workspace_tool_modules WHERE enabled = 1 AND is_core = 0').all() as { id: string }[]
    
    for (const row of rows) {
      if (lazyModuleRegistry.has(row.id)) {
        await loadModuleHandlers(row.id)
      }
    }
  } catch (err) {
    console.error('[LazyLoad] Failed to load enabled modules:', err)
  }
}


if (process.platform === 'win32') app.setAppUserModelId('com.daemon.app')

// Frameless window + heavy backdrop-filter surfaces cause DWM compositor stalls
// during drag/resize on Windows. Disabling hardware acceleration trades GPU
// compositing for CPU compositing, which stays responsive under memory pressure.
if (process.platform === 'win32') app.disableHardwareAcceleration()

// Crash capture — write unhandled errors to app_crashes table
process.on('uncaughtException', (error) => {
  try {
    const db = getDb()
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), 'uncaughtException', error.message, error.stack ?? '', Date.now()
    )
  } catch { /* DB may not be ready */ }
})

process.on('unhandledRejection', (reason) => {
  try {
    const db = getDb()
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack ?? '' : ''
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), 'unhandledRejection', message, stack, Date.now()
    )
  } catch { /* DB may not be ready */ }
})

if (!SMOKE_TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let ipcRegistered = false
let startupUiRecovery: UiRecoveryResult | null = null
let shutdownStarted = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function cleanupRuntimeState() {
  killAllSessions()
  shutdownAllLspSessions()
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

async function registerAllIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  // Bootstrap provider registry before any handlers that resolve providers
  ProviderRegistry.register(ClaudeProvider)
  ProviderRegistry.register(CodexProvider)

  // Core handlers - always loaded
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
  registerSettingsHandlers()
  registerPluginHandlers()
  registerRecoveryHandlers()
  registerEngineHandlers()
  registerToolHandlers()

  // Load enabled optional modules from DB
  await loadEnabledModules()

  // Module management IPC handlers — only expose modules whose handlers can
  // actually be lazy-loaded plus core modules. This guards against legacy DB
  // rows from earlier seeds that listed eagerly-registered handlers (their
  // toggles would be silent no-ops).
  ipcMain.handle('modules:list', ipcHandler(async () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM workspace_tool_modules ORDER BY sort_order, name').all() as { id: string; is_core: number }[]
    return rows.filter((row) => row.is_core === 1 || lazyModuleRegistry.has(row.id))
  }))

  ipcMain.handle('modules:enable', ipcHandler(async (_event, moduleId: string) => {
    if (typeof moduleId !== 'string' || !lazyModuleRegistry.has(moduleId)) {
      throw new Error(`Module '${moduleId}' is not lazy-loadable`)
    }
    const success = await loadModuleHandlers(moduleId)
    if (!success) throw new Error('Failed to load module')
    getDb().prepare('UPDATE workspace_tool_modules SET enabled = 1 WHERE id = ?').run(moduleId)
    return { requiresRestart: false }
  }))

  ipcMain.handle('modules:disable', ipcHandler(async (_event, moduleId: string) => {
    if (typeof moduleId !== 'string' || !lazyModuleRegistry.has(moduleId)) {
      throw new Error(`Module '${moduleId}' is not lazy-loadable`)
    }
    getDb().prepare('UPDATE workspace_tool_modules SET enabled = 0 WHERE id = ?').run(moduleId)
    // Handlers stay live until restart — DB persists the user intent.
    return { requiresRestart: loadedModules.has(moduleId) }
  }))

  // Window controls
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  // Close the window immediately — actual cleanup runs in `before-quit` so the
  // Windows message pump stays responsive while node-pty / LSP / SQLite shut down.
  ipcMain.on('window:close', () => {
    if (win && !win.isDestroyed()) win.close()
    else app.quit()
  })
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
  await registerAllIpc()
  trackAppLaunchTelemetry().catch((err) => {
    if (!app.isPackaged) console.warn('[Telemetry] launch event skipped:', err.message)
  })

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

  win = new BrowserWindow({
    title: 'DAEMON',
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })
  if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:browser-window-created')
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
  win.webContents.on('did-finish-load', () => {
    if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:did-finish-load')
  })
  if (SMOKE_TEST_MODE) {
    win.webContents.on('did-start-loading', () => console.log('[smoke] createWindow:did-start-loading'))
    win.webContents.on('dom-ready', () => console.log('[smoke] createWindow:dom-ready'))
    win.webContents.on('did-stop-loading', () => console.log('[smoke] createWindow:did-stop-loading'))
    win.webContents.on('render-process-gone', (_event, details) => {
      console.log('[smoke] createWindow:render-process-gone', JSON.stringify(details))
    })
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
