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
import { registerSettingsHandlers } from '../ipc/settings'
import { registerPluginHandlers } from '../ipc/plugins'
import { registerTweetHandlers } from '../ipc/tweets'
import { registerRecoveryHandlers } from '../ipc/recovery'
import { registerEngineHandlers } from '../ipc/engine'
import { registerToolHandlers } from '../ipc/tools'
import { registerPumpFunHandlers } from '../ipc/pumpfun'
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
import { registerPnlHandlers } from '../ipc/pnl'
import { registerFeedbackHandlers } from '../ipc/feedback'
import { registerProHandlers } from '../ipc/pro'
import { clearLoadedWallets } from '../services/RecoveryService'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
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

if (process.platform === 'win32') app.setAppUserModelId('DAEMON')

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
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function registerAllIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  // Bootstrap provider registry before any handlers that resolve providers
  ProviderRegistry.register(ClaudeProvider)
  ProviderRegistry.register(CodexProvider)

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
  registerSettingsHandlers()
  registerPluginHandlers()
  registerTweetHandlers()
  registerRecoveryHandlers()
  registerEngineHandlers()
  registerToolHandlers()
  registerPumpFunHandlers()
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
  registerPnlHandlers()
  registerFeedbackHandlers()
  registerProHandlers()

  // Window controls
  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window:close', () => win?.close())
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
  // HMR websockets from localhost which a restrictive 'self' policy blocks.
  //
  // We apply two different policies based on URL:
  //   1. App documents (file://): strict — no 'unsafe-eval', no minipaint: script source.
  //   2. minipaint:// iframe:     relaxed — 'unsafe-eval' is required by the bundled
  //      miniPaint editor. The iframe is cross-origin (its own protocol) and sandboxed
  //      at the webPreferences level, so its relaxed CSP can't reach the parent.
  //
  // The parent document's `frame-src minipaint:` still gates which origins may be
  // loaded as frames, so the iframe can't be swapped out from untrusted content.
  const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: daemon-icon:; worker-src 'self' blob: monaco-editor:; connect-src 'self' https://*.anthropic.com https://*.helius-rpc.com https://price.jup.ag https://api.coingecko.com; font-src 'self'; frame-src minipaint:; object-src 'none'"
  const MINIPAINT_CSP = "default-src 'self' minipaint:; script-src 'self' minipaint: 'unsafe-eval'; style-src 'self' 'unsafe-inline' minipaint:; img-src 'self' data: blob: minipaint:; worker-src 'self' blob: minipaint:; connect-src 'self' minipaint: blob: data:; font-src 'self' minipaint:; object-src 'none'"

  if (!VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isMinipaint = details.url.startsWith('minipaint://')
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [isMinipaint ? MINIPAINT_CSP : APP_CSP],
        },
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
    minWidth: 960,
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

  // Startup crash detection — warn if >3 crashes in the last hour
  try {
    const db = getDb()
    const recentCrashes = db.prepare(
      'SELECT COUNT(*) as count FROM app_crashes WHERE created_at > ?'
    ).get(Date.now() - 3600_000) as { count: number }

    if (recentCrashes.count > 3) {
      win.webContents.on('did-finish-load', () => {
        win?.webContents.send('crash-warning', recentCrashes.count)
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

app.on('window-all-closed', () => {
  killAllSessions()
  clearLoadedWallets()
  closeDb()
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
