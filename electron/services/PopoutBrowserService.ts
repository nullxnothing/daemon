/**
 * DAEMON Lite pop-out preview browser. A child BrowserWindow renders a thin
 * chrome strip (URL bar + back/forward/reload) from popout.html; the page it
 * previews loads in a main-process-owned WebContentsView guest that gets NO
 * preload and NO node access. Every navigation is validated against
 * isAllowedWebviewUrl (https or loopback http only), so the agent/user can
 * never point a preview at cleartext-remote or credentialed URLs.
 */
import { BrowserWindow, WebContentsView } from 'electron'
import path from 'node:path'
import { isAllowedWebviewUrl, openSafeExternalUrl } from '../security/externalNavigation'

const CHROME_HEIGHT = 88 // titlebar (34) + nav strip (54)
const GUEST_PARTITION = 'persist:lite-popout'
const MAX_POPOUTS = 4

interface Popout {
  window: BrowserWindow
  guest: WebContentsView
}

const popouts = new Set<Popout>()

interface PopoutDeps {
  preloadPath: string
  chromeUrl: (id: number) => string
}

let deps: PopoutDeps | null = null

export function configurePopoutBrowser(next: PopoutDeps): void {
  deps = next
}

function layoutGuest(popout: Popout): void {
  const [width, height] = popout.window.getContentSize()
  popout.guest.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) })
}

function sendNavState(popout: Popout): void {
  const wc = popout.guest.webContents
  if (popout.window.isDestroyed()) return
  popout.window.webContents.send('popout:nav-state', {
    url: wc.getURL(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    loading: wc.isLoading(),
  })
}

/** Open (or focus a fresh) preview window at the given allowlisted URL. */
export function openPopout(url: string): { opened: boolean; reason?: string } {
  if (!deps) return { opened: false, reason: 'popout browser not configured' }
  if (!isAllowedWebviewUrl(url)) return { opened: false, reason: 'URL not allowed (https or localhost only)' }

  // LRU cap: close the oldest when at capacity.
  if (popouts.size >= MAX_POPOUTS) {
    const oldest = popouts.values().next().value
    if (oldest && !oldest.window.isDestroyed()) oldest.window.close()
  }

  const window = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    title: 'Preview',
    backgroundColor: '#0c0e0d',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0e0d', symbolColor: '#9fa19d', height: 34 },
    webPreferences: {
      preload: deps.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const guest = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No preload — the guest is untrusted web content.
      partition: GUEST_PARTITION,
    },
  })

  const popout: Popout = { window, guest }
  popouts.add(popout)

  window.contentView.addChildView(guest)
  layoutGuest(popout)

  const gwc = guest.webContents

  // Block any navigation to a non-allowlisted URL; hand https off to the OS
  // browser instead of silently dropping it.
  gwc.on('will-navigate', (event, target) => {
    if (!isAllowedWebviewUrl(target)) {
      event.preventDefault()
      void openSafeExternalUrl(target)
    }
  })
  gwc.setWindowOpenHandler(({ url: target }) => {
    void openSafeExternalUrl(target)
    return { action: 'deny' }
  })
  gwc.session.on('will-download', (event) => event.preventDefault())

  gwc.on('did-navigate', () => sendNavState(popout))
  gwc.on('did-navigate-in-page', () => sendNavState(popout))
  gwc.on('did-start-loading', () => sendNavState(popout))
  gwc.on('did-stop-loading', () => sendNavState(popout))

  window.on('resize', () => layoutGuest(popout))
  window.on('closed', () => {
    popouts.delete(popout)
  })

  window.loadURL(deps.chromeUrl(window.id))
  void gwc.loadURL(url)

  return { opened: true }
}

function findPopout(windowId: number): Popout | undefined {
  for (const popout of popouts) {
    if (!popout.window.isDestroyed() && popout.window.id === windowId) return popout
  }
  return undefined
}

export function popoutNavigate(windowId: number, url: string): boolean {
  const popout = findPopout(windowId)
  if (!popout || !isAllowedWebviewUrl(url)) return false
  void popout.guest.webContents.loadURL(url)
  return true
}

export function popoutBack(windowId: number): void {
  findPopout(windowId)?.guest.webContents.navigationHistory.goBack()
}

export function popoutForward(windowId: number): void {
  findPopout(windowId)?.guest.webContents.navigationHistory.goForward()
}

export function popoutReload(windowId: number): void {
  findPopout(windowId)?.guest.webContents.reload()
}

export function closeAllPopouts(): void {
  for (const popout of popouts) {
    if (!popout.window.isDestroyed()) popout.window.close()
  }
  popouts.clear()
}
