/**
 * DAEMON Lite IPC — flavor info, first-run flag, and the "Open in DAEMON IDE"
 * handoff. Registered only by the Lite main entry (electron/main/lite.ts).
 */
import { ipcMain, app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getBooleanSetting, setBooleanSetting } from '../services/SettingsService'
import { openSafeExternalUrl } from '../security/externalNavigation'

const IDE_DOWNLOAD_URL = 'https://daemon-landing.vercel.app'
const LITE_ONBOARDING_KEY = 'lite_onboarding_complete'
const LITE_SHOW_TOOLS_KEY = 'lite_show_tools'

/** Packaged: the installer's version. Dev: app.getVersion() is Electron's own
 *  version, so read the repo package.json instead. */
function appVersion(): string {
  if (app.isPackaged) return app.getVersion()
  try {
    const require = createRequire(import.meta.url)
    return (require(path.join(process.env.APP_ROOT ?? '', 'package.json')) as { version: string }).version
  } catch {
    return app.getVersion()
  }
}

/** Full-DAEMON NSIS per-user install location; null when not installed. */
function fullIdeExePath(): string | null {
  const base = process.env.LOCALAPPDATA
  if (!base) return null
  const exe = path.join(base, 'Programs', 'DAEMON', 'DAEMON.exe')
  return fs.existsSync(exe) ? exe : null
}

export function registerLiteHandlers() {
  ipcMain.handle('lite:get-flavor-info', ipcHandler(async () => ({
    flavor: 'lite' as const,
    version: appVersion(),
    ideInstalled: fullIdeExePath() !== null,
  })))

  ipcMain.handle('lite:is-onboarding-complete', ipcHandler(async () => {
    return getBooleanSetting(LITE_ONBOARDING_KEY, false)
  }))

  ipcMain.handle('lite:set-onboarding-complete', ipcHandler(async (_event, complete: boolean) => {
    setBooleanSetting(LITE_ONBOARDING_KEY, Boolean(complete))
  }))

  // "Tools" section (wallet / trade / scanner) — off by default so a fresh
  // install stays a plain chatbox until the user (or an agent tool) opts in.
  ipcMain.handle('lite:get-show-tools', ipcHandler(async () => {
    return getBooleanSetting(LITE_SHOW_TOOLS_KEY, false)
  }))

  ipcMain.handle('lite:set-show-tools', ipcHandler(async (_event, show: boolean) => {
    setBooleanSetting(LITE_SHOW_TOOLS_KEY, Boolean(show))
  }))

  // Launch the full IDE when installed; otherwise open the download page.
  ipcMain.handle('lite:open-in-ide', ipcHandler(async () => {
    const exe = fullIdeExePath()
    if (exe) {
      const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
      child.unref()
      return { launched: true }
    }
    await openSafeExternalUrl(IDE_DOWNLOAD_URL)
    return { launched: false }
  }))
}
