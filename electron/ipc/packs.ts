import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Settings from '../services/SettingsService'
import type { PackId } from '../shared/packManifest'

// Callback into main to (re)register IPC domains when packs are enabled at
// runtime. Set by registerAllIpc() at boot so packs.ts stays decoupled from the
// registrar table.
let ensureDomains: ((enabled: Record<string, boolean>) => void) | null = null

export function setPackDomainRegistrar(fn: (enabled: Record<string, boolean>) => void): void {
  ensureDomains = fn
}

export function registerPackHandlers() {
  ipcMain.handle('packs:get-enabled', ipcHandler(async () => {
    return Settings.getEnabledPacks()
  }))

  ipcMain.handle('packs:set-enabled', ipcHandler(async (_event, id: PackId, enabled: boolean) => {
    if (typeof id !== 'string') throw new Error('Invalid pack id')
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled flag')
    const current = Settings.getEnabledPacks()
    const next = { ...current, [id]: enabled }
    Settings.setEnabledPacks(next)
    // Enabling a pack at runtime may need its IPC domains registered for the
    // first time this session. Disabling leaves handlers in place (unregistering
    // mid-session is unsafe); the renderer simply stops invoking them.
    if (enabled) ensureDomains?.(next)
    return Settings.getEnabledPacks()
  }))
}
