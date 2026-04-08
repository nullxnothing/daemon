import { ipcMain, app, shell } from 'electron'
import os from 'node:os'
import { ipcHandler } from '../services/IpcHandlerFactory'

const REPORT_ENDPOINT =
  process.env.DAEMON_BUG_REPORT_URL ??
  'https://daemon-landing.vercel.app/api/bug-report'

type BugReportInput = {
  title: string
  description: string
  activePanel?: string
  logs?: string
}

export function registerFeedbackHandlers() {
  ipcMain.handle(
    'feedback:submit',
    ipcHandler(async (_event, input: BugReportInput) => {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid payload')
      }
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      const description =
        typeof input.description === 'string' ? input.description.trim() : ''
      if (!title) throw new Error('Title is required')
      if (!description) throw new Error('Description is required')

      const meta = {
        version: app.getVersion(),
        platform: process.platform,
        osVersion: `${os.type()} ${os.release()}`,
        arch: process.arch,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        locale: app.getLocale(),
        activePanel:
          typeof input.activePanel === 'string' ? input.activePanel : undefined,
        logs: typeof input.logs === 'string' ? input.logs : undefined,
      }

      const res = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, meta }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Report failed (${res.status}): ${text.slice(0, 200)}`)
      }

      const data = (await res.json()) as {
        ok?: boolean
        number?: number
        url?: string
      }
      return {
        number: data.number,
        url: data.url,
      }
    }),
  )

  ipcMain.handle(
    'feedback:open-url',
    ipcHandler(async (_event, url: string) => {
      if (typeof url !== 'string' || !/^https:\/\/github\.com\//.test(url)) {
        throw new Error('Invalid URL')
      }
      await shell.openExternal(url)
      return { ok: true }
    }),
  )
}
