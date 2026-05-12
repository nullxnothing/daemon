import crypto from 'node:crypto'
import { getDb } from '../db/db'
import * as ProviderRegistry from './providers/ProviderRegistry'
import { recordLocalAiUsage } from './DaemonAIService'
import type { AriaMessage, AriaResponse, AriaAction } from '../shared/types'

// Strip ANSI escape codes (same regex as strip-ansi package)
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

const ARIA_SYSTEM = `You are ARIA, the orchestrator assistant for the DAEMON agent workbench. You help the user manage agents, files, panels, and development workflows.

RULES:
- Be concise and direct. No filler, no fluff.
- Never use emoji.
- When the user asks to spawn an agent, include [SPAWN_AGENT:agentId] in your response.
- When the user asks to open a file, include [OPEN_FILE:path] in your response.
- When the user asks to switch panels, include [SWITCH_PANEL:name] in your response (valid: claude, env, git, ports, process, wallet, settings, tools, terminal, browser, images, email).
- You can suggest multiple actions in one response.
- If you do not know something, say so. Do not guess.`

const MAX_HISTORY = 40
const MAX_SESSIONS = 20
const ARIA_MODEL = 'haiku'

type ConversationEntry = { role: 'user' | 'assistant'; content: string }

const conversations = new Map<string, ConversationEntry[]>()
const conversationLastUsed = new Map<string, number>()

function touchSession(sessionId: string): void {
  conversationLastUsed.set(sessionId, Date.now())

  if (conversations.size > MAX_SESSIONS) {
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

function parseActions(text: string): AriaAction[] {
  const actions: AriaAction[] = []

  const spawnMatches = text.matchAll(/\[SPAWN_AGENT:([^\]]+)\]/g)
  for (const match of spawnMatches) {
    actions.push({ type: 'spawn_agent', label: `Spawn ${match[1]}`, value: match[1] })
  }

  const fileMatches = text.matchAll(/\[OPEN_FILE:([^\]]+)\]/g)
  for (const match of fileMatches) {
    const filename = match[1].split(/[\\/]/).pop() ?? match[1]
    actions.push({ type: 'open_file', label: `Open ${filename}`, value: match[1] })
  }

  const panelMatches = text.matchAll(/\[SWITCH_PANEL:([^\]]+)\]/g)
  for (const match of panelMatches) {
    actions.push({ type: 'switch_panel', label: `Go to ${match[1]}`, value: match[1] })
  }

  return actions
}

function stripActionTags(text: string): string {
  return text
    .replace(/\[SPAWN_AGENT:[^\]]+\]/g, '')
    .replace(/\[OPEN_FILE:[^\]]+\]/g, '')
    .replace(/\[SWITCH_PANEL:[^\]]+\]/g, '')
    .trim()
}

function persistMessage(msg: Omit<AriaMessage, 'id' | 'created_at'>): string {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO aria_messages (id, role, content, metadata, session_id) VALUES (?,?,?,?,?)'
  ).run(id, msg.role, msg.content, msg.metadata, msg.session_id)
  return id
}

function buildPrompt(history: ConversationEntry[]): string {
  const recent = history.slice(-MAX_HISTORY)
  return [
    'ARIA side-panel conversation:',
    ...recent.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`),
    '',
    'Respond as ARIA. Include action tags only when an action is useful.',
  ].join('\n')
}

export async function sendMessage(sessionId: string, userMessage: string): Promise<AriaResponse> {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, [])
  }
  touchSession(sessionId)
  const history = conversations.get(sessionId)!

  history.push({ role: 'user', content: userMessage })

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY)
  }

  persistMessage({ role: 'user', content: userMessage, metadata: '{}', session_id: sessionId })

  const provider = ProviderRegistry.getDefault()
  const prompt = buildPrompt(history)
  let rawText: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      rawText = await provider.runPrompt({
        prompt,
        systemPrompt: ARIA_SYSTEM,
        model: ARIA_MODEL,
        effort: 'low',
        maxTokens: 1024,
        timeoutMs: 60_000,
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
  if (!rawText) throw new Error('Failed after retries')

  const cleanText = stripAnsi(rawText)

  history.push({ role: 'assistant', content: cleanText })
  recordLocalAiUsage({
    feature: 'aria-side-panel',
    provider: provider.id === 'claude' ? 'anthropic' : 'local',
    model: ARIA_MODEL,
    inputText: prompt,
    outputText: cleanText,
  })

  const actions = parseActions(cleanText)
  const displayText = stripActionTags(cleanText)

  persistMessage({
    role: 'assistant',
    content: cleanText,
    metadata: JSON.stringify({ actions }),
    session_id: sessionId,
  })

  return { text: displayText, actions }
}

export function getHistory(sessionId: string, limit = 50): AriaMessage[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM aria_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(sessionId, limit) as AriaMessage[]
}

export function clearSession(sessionId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM aria_messages WHERE session_id = ?').run(sessionId)
  conversations.delete(sessionId)
  conversationLastUsed.delete(sessionId)
}
