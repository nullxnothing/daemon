import * as SecureKey from './SecureKeyService'

const BASE = 'https://clawpump.tech/api/v1'
const API_TIMEOUT_MS = 15_000
const API_KEY_NAME = 'CLAWPUMP_API_KEY'

// ------------------------------------------------------------------ types ---

export interface ClawpumpSkill {
  slug: string
  name: string
  description: string
  alwaysOn: boolean
}

export interface ClawpumpAgent {
  id: string
  name: string
  status: string
  strategy?: string
  persona?: string
  model?: string
  skills?: string[]
  createdAt?: string
  walletAddress?: string
  [key: string]: unknown
}

export interface ClawpumpMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  [key: string]: unknown
}

export interface ClawpumpChatReply {
  content: string
  [key: string]: unknown
}

export interface CreateAgentInput {
  name: string
  strategy?: string
  persona?: string
  model?: string
  skills?: string[]
}

// ----------------------------------------------------------------- helpers ---

function getApiKey(): string {
  const key = SecureKey.getKey(API_KEY_NAME)
  if (!key) throw new Error('ClawPump API key not configured')
  return key
}

export function isConfigured(): boolean {
  return !!SecureKey.getKey(API_KEY_NAME)
}

export function storeApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key is empty')
  SecureKey.storeKey(API_KEY_NAME, trimmed)
}

export function clearApiKey(): void {
  SecureKey.deleteKey(API_KEY_NAME)
}

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${getApiKey()}`,
        ...(init?.headers ?? {}),
      },
    })
    const rawBody = await res.text()
    let body: (T & { error?: string }) | Record<string, never> = {}

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as T & { error?: string }
      } catch {
        throw new Error(`Invalid JSON response from ClawPump API (${res.status})`)
      }
    }

    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    return body as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`ClawPump API timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// Responses may wrap (`{agents:[...]}`) or be bare arrays — normalize either way.
function unwrapArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[]
  const wrapped = (data as Record<string, unknown> | null)?.[key]
  return Array.isArray(wrapped) ? (wrapped as T[]) : []
}

function unwrapObject<T>(data: unknown, key: string): T {
  const wrapped = (data as Record<string, unknown> | null)?.[key]
  return (wrapped ?? data) as T
}

// ------------------------------------------------------------------- reads ---

export async function listSkills(): Promise<ClawpumpSkill[]> {
  const data = await fetchJson<unknown>('/skills')
  return unwrapArray<ClawpumpSkill>(data, 'skills')
}

export async function listAgents(): Promise<ClawpumpAgent[]> {
  const data = await fetchJson<unknown>('/agents')
  return unwrapArray<ClawpumpAgent>(data, 'agents')
}

export async function getAgent(agentId: string): Promise<ClawpumpAgent> {
  const data = await fetchJson<unknown>(`/agents/${encodeURIComponent(agentId)}`)
  return unwrapObject<ClawpumpAgent>(data, 'agent')
}

export async function getMessages(agentId: string, limit = 50): Promise<ClawpumpMessage[]> {
  const data = await fetchJson<unknown>(`/agents/${encodeURIComponent(agentId)}/messages?limit=${limit}`)
  return unwrapArray<ClawpumpMessage>(data, 'messages')
}

// ------------------------------------------------------------------ writes ---

export async function createAgent(input: CreateAgentInput): Promise<ClawpumpAgent> {
  const data = await fetchJson<unknown>('/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return unwrapObject<ClawpumpAgent>(data, 'agent')
}

export async function startAgent(agentId: string): Promise<ClawpumpAgent> {
  const data = await fetchJson<unknown>(`/agents/${encodeURIComponent(agentId)}/start`, { method: 'POST' })
  return unwrapObject<ClawpumpAgent>(data, 'agent')
}

export async function stopAgent(agentId: string): Promise<ClawpumpAgent> {
  const data = await fetchJson<unknown>(`/agents/${encodeURIComponent(agentId)}/stop`, { method: 'POST' })
  return unwrapObject<ClawpumpAgent>(data, 'agent')
}

export async function deleteAgent(agentId: string): Promise<{ deleted: boolean }> {
  await fetchJson<unknown>(`/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' })
  return { deleted: true }
}

export async function chat(agentId: string, message: string): Promise<ClawpumpChatReply> {
  return fetchJson<ClawpumpChatReply>(`/agents/${encodeURIComponent(agentId)}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}
