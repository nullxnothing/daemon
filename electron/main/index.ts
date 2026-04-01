import { app, BrowserWindow, shell, ipcMain, protocol, net, session } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { getDb, closeDb } from '../db/db'
import { registerTerminalHandlers, killAllSessions } from '../ipc/terminal'
import { registerFilesystemHandlers } from '../ipc/filesystem'
import { registerProjectHandlers } from '../ipc/projects'
import { registerAgentHandlers } from '../ipc/agents'
import { registerClaudeHandlers } from '../ipc/claude'
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
import { clearLoadedWallets } from '../services/RecoveryService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// Monaco offline protocol — must be registered before app.whenReady()
// In production, Monaco workers load via this custom protocol instead of CDN
protocol.registerSchemesAsPrivileged([{
  scheme: 'monaco-editor',
  privileges: { standard: true, supportFetchAPI: true, bypassCSP: true },
}, {
  scheme: 'daemon-icon',
  privileges: { standard: true, supportFetchAPI: true, bypassCSP: true },
}])

if (process.platform === 'win32') app.setAppUserModelId('DAEMON')

if (!app.requestSingleInstanceLock()) {
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

  registerTerminalHandlers()
  registerFilesystemHandlers()
  registerProjectHandlers()
  registerAgentHandlers()
  registerClaudeHandlers()
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
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      return shell.openExternal(url)
    }
  })
}

async function createWindow() {
  getDb()
  registerAllIpc()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: daemon-icon:; worker-src blob: monaco-editor:; connect-src 'self' https://*.anthropic.com https://*.helius-rpc.com https://price.jup.ag https://api.coingecko.com; font-src 'self'; object-src 'none'"]
      }
    })
  })

  // Monaco offline: serve node_modules/monaco-editor files via custom protocol
  protocol.handle('monaco-editor', (request) => {
    const url = request.url.slice('monaco-editor:///'.length)
    const basePath = path.resolve(process.env.APP_ROOT, 'node_modules', 'monaco-editor', 'min')
    const filePath = path.resolve(basePath, url)
    if (!filePath.startsWith(basePath + path.sep) && filePath !== basePath) {
      return new Response('Forbidden: path traversal', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  protocol.handle('daemon-icon', (request) => {
    const encodedPath = request.url.replace(/^daemon-icon:\/\/\/?/, '')
    const filePath = decodeURIComponent(encodedPath)

    // Restrict to image file extensions only
    const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif', '.webp'])
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
      const db = getDb()
      const projects = db.prepare('SELECT path FROM projects').all() as Array<{ path: string }>
      isProjectPath = projects.some((p) => {
        const projectDir = path.resolve(p.path)
        return resolved === projectDir || resolved.startsWith(projectDir + path.sep)
      })
    } catch {
      // DB not ready — only allow app resources
    }

    if (!isAppResource && !isProjectPath) {
      return new Response('Forbidden: path outside allowed directories', { status: 403 })
    }

    return net.fetch(pathToFileURL(resolved).toString())
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
      webviewTag: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    if (process.env.DAEMON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('maximize', () => win?.webContents.send('window:maximized'))
  win.on('unmaximize', () => win?.webContents.send('window:unmaximized'))
}

app.whenReady().then(createWindow)

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
