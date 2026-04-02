import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import {
  navigate,
  capturePageContent,
  getPage,
  getLatestPage,
  analyzePage,
  auditPage,
  getHistory,
  clearHistory,
} from '../services/BrowserService'
import * as SecureKey from '../services/SecureKeyService'
import { ipcHandler } from '../services/IpcHandlerFactory'

const BROWSER_AGENT_SYSTEM = `You are a browser agent in a developer IDE. You navigate pages and debug web content.

RULES:
- To navigate, include [NAVIGATE:URL] in your response (e.g. [NAVIGATE:https://solana.com])
- Always add the navigate tag when the user asks to go to a site
- Be concise and technical
- When shown inspect data or errors, identify the component and suggest fixes`

// Conversation history per session with LRU eviction
const MAX_CONVERSATIONS = 20
const conversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()
const conversationLastUsed = new Map<string, number>()

function touchConversation(sessionId: string): void {
  conversationLastUsed.set(sessionId, Date.now())

  if (conversations.size > MAX_CONVERSATIONS) {
    let oldestId: string | null = null
    let oldestTime = Infinity
    for (const [id, time] of conversationLastUsed) {
      if (time < oldestTime) {
        oldestTime = time
        oldestId = id
      }
    }
    if (oldestId) {
      conversations.delete(oldestId)
      conversationLastUsed.delete(oldestId)
    }
  }
}

/** Read OAuth token from Claude CLI credential store */
function getOAuthToken(): string | null {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    if (!fs.existsSync(credPath)) return null
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'))
    const token = creds?.claudeAiOauth?.accessToken
    return (token && typeof token === 'string' && token.startsWith('sk-ant-')) ? token : null
  } catch {
    return null
  }
}

function getClient(): Anthropic {
  // Priority 1: OAuth token from Claude CLI (Max subscription — no API key needed)
  // Requires Authorization: Bearer + anthropic-beta: oauth-2025-04-20
  const oauthToken = getOAuthToken()
  if (oauthToken) {
    return new Anthropic({
      apiKey: 'oauth-placeholder',
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        headers.delete('x-api-key')
        headers.set('Authorization', `Bearer ${oauthToken}`)
        headers.set('anthropic-beta', 'oauth-2025-04-20')
        return globalThis.fetch(url, { ...init, headers })
      },
    })
  }

  // Priority 2: Stored API key (from Settings > Keys)
  const stored = SecureKey.getKey('ANTHROPIC_API_KEY')
  if (stored) return new Anthropic({ apiKey: stored })

  // Priority 3: Environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  throw new Error('No Claude auth found. Connect Claude CLI in onboarding or add an API key in Settings > Keys.')
}

export function registerBrowserHandlers() {
  ipcMain.handle('browser:navigate', ipcHandler(async (_event, url: string) => {
    return await navigate(url)
  }))

  ipcMain.handle('browser:capture', ipcHandler(async (
    _event,
    pageId: string,
    url: string,
    title: string,
    content: string,
  ) => {
    capturePageContent(pageId, url, title, content)
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

  ipcMain.handle('browser:chat', ipcHandler(async (
    _event,
    sessionId: string,
    userMessage: string,
    browserContext?: string,
  ) => {
    const client = getClient()

    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, [])
    }
    touchConversation(sessionId)
    const history = conversations.get(sessionId)!

    // Build user message with browser context
    let fullMessage = userMessage
    if (browserContext) {
      fullMessage = `[Browser Context]\n${browserContext}\n\n${userMessage}`
    }

    history.push({ role: 'user', content: fullMessage })

    // Keep bounded (last 20 turns)
    if (history.length > 40) {
      history.splice(0, history.length - 40)
    }

    // Retry with backoff on rate limit (429)
    let response: Anthropic.Message | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: BROWSER_AGENT_SYSTEM,
          messages: history,
        })
        break
      } catch (err: any) {
        if (err?.status === 429 && attempt < 2) {
          const wait = (attempt + 1) * 3_000
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        throw err
      }
    }
    if (!response) throw new Error('Failed after retries')

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    history.push({ role: 'assistant', content: text })

    // Extract navigation commands
    const navMatch = text.match(/\[NAVIGATE:(https?:\/\/[^\]]+)\]/)
    const navigateUrl = navMatch?.[1] ?? null
    const displayText = text.replace(/\[NAVIGATE:[^\]]+\]/g, '').trim()

    return { text: displayText, navigateUrl }
  }))

  ipcMain.handle('browser:chat-reset', ipcHandler(async (_event, sessionId: string) => {
    conversations.delete(sessionId)
    conversationLastUsed.delete(sessionId)
  }))
}
