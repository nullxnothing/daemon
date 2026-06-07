import * as SecureKey from './SecureKeyService'

const BASE = 'https://degentools.co/api/v1'
const MCP_PATH = '/mcp'
const API_TIMEOUT_MS = 45_000
const API_KEY_NAME = 'DEGENTOOLS_API_KEY'

export type DegenToolsMemeType = 'meme' | 'banner' | 'pfp' | 'sticker'
export type DegenToolsCopyType = 'shill_tweets' | 'raid_messages' | 'announcements'

export interface GenerateMemeInput {
  prompt: string
  token_name: string
  token_ticker: string
  type?: DegenToolsMemeType
}

export interface GenerateShillCopyInput {
  token_name: string
  token_ticker: string
  copy_type?: DegenToolsCopyType
  count?: number
}

export interface GetTokenDataInput {
  query: string
}

export interface LaunchTokenInput {
  name: string
  symbol: string
  description: string
  image_url: string
}

export interface DegenToolsToolResult<T = unknown> {
  text: string
  json: T | null
}

interface JsonRpcError {
  message?: string
}

interface McpContent {
  type?: string
  text?: string
}

interface McpToolCallResult {
  content?: McpContent[]
  isError?: boolean
}

interface JsonRpcResponse<T> {
  result?: T
  error?: string | JsonRpcError
}

function getApiKey(): string {
  const key = SecureKey.getKey(API_KEY_NAME) ?? process.env.DEGENTOOLS_API_KEY
  if (!key) throw new Error('DegenTools API key not configured')
  return key
}

export function isConfigured(): boolean {
  return Boolean(SecureKey.getKey(API_KEY_NAME) ?? process.env.DEGENTOOLS_API_KEY)
}

export function storeApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key is empty')
  SecureKey.storeKey(API_KEY_NAME, trimmed)
}

export function clearApiKey(): void {
  SecureKey.deleteKey(API_KEY_NAME)
}

function rpcErrorMessage(error: JsonRpcResponse<unknown>['error']): string {
  if (typeof error === 'string') return error
  return error?.message ?? 'DegenTools API request failed'
}

function parseToolJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function callMcp<T>(method: string, params?: unknown, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BASE}${MCP_PATH}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-DegenTools-API-Key': getApiKey(),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        id: Date.now(),
        ...(params === undefined ? {} : { params }),
      }),
    })

    const rawBody = await response.text()
    const body = rawBody.trim()
      ? JSON.parse(rawBody) as JsonRpcResponse<T>
      : {} as JsonRpcResponse<T>

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('DegenTools rate limit exceeded. Back off and retry after the cooldown window.')
      }
      throw new Error(body.error ? rpcErrorMessage(body.error) : `DegenTools API returned HTTP ${response.status}`)
    }

    if (body.error) throw new Error(rpcErrorMessage(body.error))
    if (body.result === undefined) throw new Error('DegenTools API returned an empty result')
    return body.result
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error('Invalid JSON response from DegenTools API')
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`DegenTools API timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function initialize(): Promise<unknown> {
  return callMcp('initialize')
}

export async function listTools(): Promise<unknown> {
  return callMcp('tools/list')
}

export async function callTool<T = unknown>(
  name: string,
  args: object,
): Promise<DegenToolsToolResult<T>> {
  if (!name.trim()) throw new Error('Tool name is required')
  const result = await callMcp<McpToolCallResult>('tools/call', {
    name,
    arguments: args,
  })

  const text = result.content?.find((item) => typeof item.text === 'string')?.text ?? ''
  if (result.isError) throw new Error(text || 'DegenTools tool failed')
  return { text, json: parseToolJson<T>(text) }
}

export function generateMeme(input: GenerateMemeInput): Promise<DegenToolsToolResult> {
  return callTool('generate_meme', {
    ...input,
    type: input.type ?? 'meme',
  })
}

export function generateShillCopy(input: GenerateShillCopyInput): Promise<DegenToolsToolResult> {
  return callTool('generate_shill_copy', {
    ...input,
    copy_type: input.copy_type ?? 'shill_tweets',
    count: input.count ?? 5,
  })
}

export function getTokenData(input: GetTokenDataInput): Promise<DegenToolsToolResult> {
  return callTool('get_token_data', input)
}

export function launchToken(input: LaunchTokenInput): Promise<DegenToolsToolResult> {
  return callTool('launch_token', input)
}
