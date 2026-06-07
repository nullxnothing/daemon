/**
 * GLM (z.ai) operator backend config.
 *
 * z.ai exposes a first-class Anthropic-protocol endpoint that serves GLM over the
 * Anthropic Messages API *with tool use* — the exact shape ARIA's tool-loop already
 * produces. So GLM runs the full operator by pointing the existing Anthropic agent
 * turn at z.ai's base URL; no OpenAI runner or message translation is needed.
 *
 * z.ai is a paid API — no pricing here. The endpoint is config-driven (apiKeyEnv /
 * baseURL / model) so MiniMax/MiMo siblings can be added later (provider-lab pattern).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getKey } from '../SecureKeyService'

export type OperatorBackend = 'glm' | 'claude' | 'codex'

export interface OperatorEndpoint {
  apiKey: string
  baseURL: string
  model: string
}

// z.ai GLM Coding Plan, Anthropic-compatible endpoint. GLM-4.7 is the coding model.
const GLM = {
  apiKeyEnv: 'ZAI_API_KEY',
  baseURL: 'https://api.z.ai/api/anthropic',
  model: 'glm-4.7',
} as const

/** Read the z.ai key from secure storage first, then the environment. */
function readZaiKey(): string | null {
  try {
    const stored = getKey(GLM.apiKeyEnv)
    if (stored) return stored
  } catch { /* secure storage unavailable — fall through to env */ }
  return process.env[GLM.apiKeyEnv] ?? null
}

/** Endpoint config for driving the Anthropic agent turn against GLM, or null if unkeyed. */
export function getGlmEndpoint(): OperatorEndpoint | null {
  const apiKey = readZaiKey()
  if (!apiKey) return null
  return { apiKey, baseURL: GLM.baseURL, model: GLM.model }
}

function hasClaudeAuth(): boolean {
  try {
    if (getKey('ANTHROPIC_API_KEY')) return true
  } catch { /* fall through */ }
  if (process.env.ANTHROPIC_API_KEY) return true
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      if (creds.oauthToken || creds.accessToken) return true
    }
  } catch { /* no creds */ }
  return false
}

function hasCodexAuth(): boolean {
  if (process.env.CODEX_API_KEY) return true
  try {
    return fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'))
  } catch {
    return false
  }
}

/**
 * Pick the operator backend by what's actually usable, GLM preferred (cheapest default).
 * Returns null when nothing is ready, so the caller can surface a clear "add a key" error.
 */
export function resolveOperatorBackend(): OperatorBackend | null {
  if (readZaiKey()) return 'glm'
  if (hasClaudeAuth()) return 'claude'
  if (hasCodexAuth()) return 'codex'
  return null
}

/** Whether GLM is the configured default but unusable (so the UI can nudge "add a Z.AI key"). */
export function glmKeyMissing(): boolean {
  return !readZaiKey()
}
