/**
 * Minimal preload for the DAEMON Lite pop-out chrome window. Exposes ONLY the
 * navigation channels for its own guest view — deliberately NOT the full
 * window.daemon.* surface (the chrome strip has no business reaching wallet,
 * keys, or the agent). isTrustedSender in main is the enforcement boundary.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('daemonPopout', {
  navigate: (url: string) => ipcRenderer.invoke('popout:navigate', url),
  back: () => ipcRenderer.send('popout:back'),
  forward: () => ipcRenderer.send('popout:forward'),
  reload: () => ipcRenderer.send('popout:reload'),
  onNavState: (handler: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => handler(state)
    ipcRenderer.on('popout:nav-state', listener)
    return () => ipcRenderer.removeListener('popout:nav-state', listener)
  },
})
