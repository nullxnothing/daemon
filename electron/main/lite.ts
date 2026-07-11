/**
 * DAEMON Lite main entry. Deliberately composed instead of forking
 * main/index.ts: one window, a focused project/filesystem/terminal/Solana
 * workflow surface, separate userData, and no packs, bridge, or auto-update.
 */
import 'dotenv/config'
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import { getDb, closeDb } from '../db/db'
import { registerAriaHandlers } from '../ipc/aria'
import { registerProviderHandlers } from '../ipc/provider'
import { registerMemoryHandlers } from '../ipc/memory'
import { registerSecureKeyHandlers } from '../ipc/secureKeys'
import { registerLiteHandlers } from '../ipc/lite'
import { registerWalletHandlers } from '../ipc/wallet'
import { registerPnlHandlers } from '../ipc/pnl'
import { registerForensicsHandlers } from '../ipc/forensics'
import { registerPopoutHandlers } from '../ipc/popout'
import { registerLiteFilesystemHandlers, stopLiteFilesystemWatcher } from '../ipc/filesystem.lite'
import { clearLiteProjectPickCapability, registerLiteProjectHandlers } from '../ipc/projects.lite'
import { killAllLiteTerminalSessions, registerLiteTerminalHandlers } from '../ipc/terminal.lite'
import { registerValidatorHandlers, stopValidatorProcess } from '../ipc/validator'
import { registerShiplineHandlers } from '../ipc/shipline'
import { registerMemeStudioHandlers } from '../ipc/memeStudio'
import { configurePopoutBrowser, closeAllPopouts } from '../services/PopoutBrowserService'
import { ClaudeProvider, CodexProvider, ProviderRegistry } from '../services/providers'
import { getKeyEncryptionWarning, getStorageBackend } from '../services/SecureKeyService'
import { isSafeExternalUrl, openSafeExternalUrl } from '../security/externalNavigation'
import { isTrustedSender, setTrustedIpcOrigin } from '../security/ipcSender'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DAEMON_FLAVOR = 'lite'
process.env.APP_ROOT = path.join(__dirname, '../..')
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist-lite')
const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL
const SMOKE_TEST_MODE = process.env.DAEMON_SMOKE_TEST === '1'

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// The focused workbench is the canonical DAEMON app. Honor Electron's
// conventional switch for isolated profiles used by packaged smoke/E2E.
const cliUserDataDir = app.commandLine.getSwitchValue('user-data-dir').trim()
app.setPath(
  'userData',
  process.env.DAEMON_USER_DATA_DIR?.trim() || cliUserDataDir || path.join(app.getPath('appData'), 'daemon'),
)

if (SMOKE_TEST_MODE) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DAEMON_SMOKE_CDP_PORT ?? '9333')
} else if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DAEMON_DEV_CDP_PORT ?? '9224')
}

if (process.platform === 'win32') app.setAppUserModelId('com.daemon.app')

function recordAppCrash(type: string, message: string, stack = '') {
  try {
    const db = getDb()
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), type, message, stack, Date.now()
    )
  } catch { /* DB may not be ready */ }
}

process.on('uncaughtException', (error) => {
  recordAppCrash('uncaughtException', error.message, error.stack ?? '')
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack ?? '' : ''
  recordAppCrash('unhandledRejection', message, stack)
})

if (!SMOKE_TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let ipcRegistered = false
let shutdownStarted = false
const preload = path.join(__dirname, '../preload/index.mjs')
const popoutPreload = path.join(__dirname, '../preload/popout.mjs')
const liteHtml = path.join(RENDERER_DIST, 'lite.html')

function popoutChromeUrl(): string {
  if (VITE_DEV_SERVER_URL) return new URL('popout.html', VITE_DEV_SERVER_URL).toString()
  return `file://${path.join(RENDERER_DIST, 'popout.html')}`
}

function beginShutdownCleanup() {
  if (shutdownStarted) return
  shutdownStarted = true
  killAllLiteTerminalSessions()
  stopValidatorProcess()
  stopLiteFilesystemWatcher()
  clearLiteProjectPickCapability()
  closeAllPopouts()
  closeDb()
}

function registerLiteIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  ProviderRegistry.register(ClaudeProvider)
  ProviderRegistry.register(CodexProvider)

  registerProviderHandlers()
  registerSecureKeyHandlers()
  registerAriaHandlers()
  registerMemoryHandlers()
  registerLiteHandlers()
  registerWalletHandlers()
  registerPnlHandlers()
  registerForensicsHandlers()
  registerPopoutHandlers()
  registerLiteFilesystemHandlers()
  registerLiteProjectHandlers()
  registerLiteTerminalHandlers()
  registerValidatorHandlers()
  registerShiplineHandlers()
  registerMemeStudioHandlers()

  configurePopoutBrowser({ preloadPath: popoutPreload, chromeUrl: () => popoutChromeUrl() })

  ipcMain.handle('shell:open-external', async (event, url: string) => {
    if (!isTrustedSender(event)) return
    await openSafeExternalUrl(url)
  })
}

async function createWindow() {
  if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:start')
  setTrustedIpcOrigin(VITE_DEV_SERVER_URL ? new URL(VITE_DEV_SERVER_URL).origin : 'file://')
  registerLiteIpc()

  // Tight CSP in production — the Lite renderer talks only over IPC; all model
  // API calls happen in the main process. Dev needs Vite HMR, so skip there.
  if (!VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'"],
        },
      })
    })
  }

  win = new BrowserWindow({
    title: 'Daemon',
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    // Cursor-style chrome: hidden native titlebar with dark overlay controls;
    // the renderer draws a draggable strip that blends into the app.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0c0e0d',
      symbolColor: '#9fa19d',
      height: 34,
    },
    backgroundColor: '#0c0e0d',
    icon: path.join(process.env.VITE_PUBLIC, 'daemon-icon.png'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    if (SMOKE_TEST_MODE) console.log('[smoke] createWindow:show:ready-to-show')
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(new URL('lite.html', VITE_DEV_SERVER_URL).toString())
    if (process.env.DAEMON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(liteHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void openSafeExternalUrl(url)
    return { action: 'deny' }
  })

  // Block navigation away from the app origin.
  win.webContents.on('will-navigate', (event, url) => {
    const appOrigin = VITE_DEV_SERVER_URL ? new URL(VITE_DEV_SERVER_URL).origin : 'file://'
    if (new URL(url).origin !== appOrigin) event.preventDefault()
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    recordAppCrash('render-process-gone', JSON.stringify(details))
  })
  if (SMOKE_TEST_MODE) {
    win.webContents.on('did-finish-load', () => console.log('[smoke] createWindow:did-finish-load'))
  }
}

app.whenReady().then(async () => {
  if (SMOKE_TEST_MODE) console.log('[smoke] app:ready')
  getDb()

  const keyEncryptionWarning = getKeyEncryptionWarning()
  if (keyEncryptionWarning) {
    console.warn('[secure-key]', keyEncryptionWarning, '(backend:', getStorageBackend(), ')')
    recordAppCrash('key-encryption-degraded', keyEncryptionWarning, `backend=${getStorageBackend() ?? 'n/a'}`)
  }

  await createWindow()

  if (app.isPackaged && process.env.DAEMON_DISABLE_AUTO_UPDATE !== '1' && !SMOKE_TEST_MODE) {
    const pkg = await import('electron-updater')
    const { autoUpdater } = pkg.default
    autoUpdater.on('error', (error: Error) => console.error('[AutoUpdater]', error.message))
    void autoUpdater.checkForUpdatesAndNotify().catch((error: Error) => console.error('[AutoUpdater]', error.message))
    setInterval(() => {
      void autoUpdater.checkForUpdatesAndNotify().catch((error: Error) => console.error('[AutoUpdater]', error.message))
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
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('activate', () => {
  if (shutdownStarted) return
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    void createWindow()
  }
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    beginShutdownCleanup()
    app.quit()
    process.exit(0)
  })
}
