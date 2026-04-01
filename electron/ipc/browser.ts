import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  navigate,
  getPage,
  getLatestPage,
  analyzePage,
  auditPage,
  getHistory,
  clearHistory,
} from '../services/BrowserService'
import { getClaudePath } from '../services/ClaudeRouter'
import { ipcHandler } from '../services/IpcHandlerFactory'

const BROWSER_AGENT_PROMPT = `You are a Browser Agent inside DAEMON — a collaborative development assistant that can see and interact with web pages the user is viewing.

You receive live context from the browser:
- [CONSOLE] messages show console.log, console.warn, and console.error from the page
- [ERROR] messages show uncaught exceptions and runtime errors
- [INSPECT] messages show elements the user Ctrl+clicked, with CSS selectors and computed styles
- [NAV] messages show URL changes as the user navigates

Your capabilities:
- Analyze page structure, layout, and styling from inspect data
- Debug JavaScript errors using console output
- Suggest code fixes when the user points at broken elements
- Identify components from selectors and map them to source files
- Explain what elements do and how they're styled

BROWSER CONTROL:
You can navigate the browser by outputting this exact format:
[NAVIGATE] https://example.com

The browser will automatically navigate to that URL. Use this instead of opening external browsers.
Examples:
- User says "go to solana.com" → output: [NAVIGATE] https://solana.com
- User says "open localhost:3000" → output: [NAVIGATE] http://localhost:3000
- User says "check the docs" → output: [NAVIGATE] https://docs.example.com

When the user inspects an element:
1. Identify what component/element it is from the selector
2. If it's a localhost dev server, try to map the selector to a source file
3. Suggest improvements or fixes if asked
4. Reference exact CSS selectors so the user can find elements

Be concise. Lead with the answer. The user is a developer — speak technically.`

export function registerBrowserHandlers() {
  ipcMain.handle('browser:navigate', ipcHandler(async (_event, url: string) => {
    return await navigate(url)
  }))

  ipcMain.handle('browser:content', ipcHandler(async (_event, pageId: string) => {
    const page = getPage(pageId) ?? getLatestPage()
    if (!page) throw new Error('No page loaded')
    return page
  }))

  ipcMain.handle('browser:analyze', ipcHandler(async (
    _event,
    pageId: string,
    type: 'summarize' | 'extract' | 'audit' | 'compare',
    target?: string,
  ) => {
    return await analyzePage(pageId, type, target)
  }))

  ipcMain.handle('browser:audit', ipcHandler(async (_event, pageId: string) => {
    return await auditPage(pageId)
  }))

  ipcMain.handle('browser:history', ipcHandler(async () => {
    return getHistory()
  }))

  ipcMain.handle('browser:clear', ipcHandler(async () => {
    clearHistory()
  }))

  ipcMain.handle('browser:agent-command', ipcHandler(async () => {
    const promptPath = path.join(os.tmpdir(), `daemon_browser_agent_${Date.now()}.txt`)
    fs.writeFileSync(promptPath, BROWSER_AGENT_PROMPT, 'utf8')

    const claudePath = getClaudePath()
    const command = `${claudePath} --model claude-sonnet-4-20250514 --append-system-prompt-file "${promptPath}"`
    return { command, promptPath }
  }))
}
