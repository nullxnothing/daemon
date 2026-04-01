import { safeStorage } from 'electron'
import { getDb } from '../db/db'
import { pluginPrompt, orchestratedPrompt } from './PluginPrompt'
import type { GmailMessage, GmailAuthStatus, GmailExtractionResult, ExtractedItem } from '../shared/types'

const PLUGIN_ID = 'gmail'
const OAUTH_SERVICE = 'gmail'

// --- OAuth Token Management ---

interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiry: number
}

function storeTokens(tokens: OAuthTokens): void {
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO oauth_tokens (service, access_token, refresh_token, expiry) VALUES (?,?,?,?)'
  ).run(
    OAUTH_SERVICE,
    safeStorage.encryptString(tokens.accessToken),
    safeStorage.encryptString(tokens.refreshToken),
    tokens.expiry,
  )
}

function loadTokens(): OAuthTokens | null {
  const db = getDb()
  const row = db.prepare('SELECT access_token, refresh_token, expiry FROM oauth_tokens WHERE service = ?')
    .get(OAUTH_SERVICE) as { access_token: Buffer; refresh_token: Buffer; expiry: number } | undefined

  if (!row) return null

  return {
    accessToken: safeStorage.decryptString(Buffer.from(row.access_token)),
    refreshToken: safeStorage.decryptString(Buffer.from(row.refresh_token)),
    expiry: row.expiry,
  }
}

function clearTokens(): void {
  const db = getDb()
  db.prepare('DELETE FROM oauth_tokens WHERE service = ?').run(OAUTH_SERVICE)
}

function isTokenExpired(tokens: OAuthTokens): boolean {
  return Date.now() > tokens.expiry - 60000 // 1 min buffer
}

// --- Google API Helpers ---

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<OAuthTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`)

  const data = await response.json() as { access_token: string; expires_in: number; refresh_token?: string }
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiry: Date.now() + data.expires_in * 1000,
  }

  storeTokens(tokens)
  return tokens
}

async function getValidToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not authenticated. Connect Gmail first.')

  if (isTokenExpired(tokens)) {
    // Load client credentials from secure keys
    const db = getDb()
    const clientId = getSecureKey('GMAIL_CLIENT_ID')
    const clientSecret = getSecureKey('GMAIL_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('Gmail client credentials not configured')

    const refreshed = await refreshAccessToken(clientId, clientSecret, tokens.refreshToken)
    return refreshed.accessToken
  }

  return tokens.accessToken
}

function getSecureKey(name: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const db = getDb()
  const row = db.prepare('SELECT encrypted_value FROM secure_keys WHERE key_name = ?').get(name) as
    { encrypted_value: Buffer } | undefined
  if (!row) return null
  return safeStorage.decryptString(Buffer.from(row.encrypted_value))
}

async function gmailFetch(endpoint: string, token: string): Promise<unknown> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gmail API error ${response.status}: ${text}`)
  }

  return response.json()
}

// --- Public API ---

export async function getAuthStatus(): Promise<GmailAuthStatus> {
  const tokens = loadTokens()
  if (!tokens) return { isAuthenticated: false, email: null }

  try {
    const token = await getValidToken()
    const profile = await gmailFetch('profile', token) as { emailAddress: string }
    return { isAuthenticated: true, email: profile.emailAddress }
  } catch {
    return { isAuthenticated: false, email: null }
  }
}

export async function authenticate(clientId: string, clientSecret: string): Promise<GmailAuthStatus> {
  // Store credentials securely for token refresh
  if (safeStorage.isEncryptionAvailable()) {
    const db = getDb()
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO secure_keys (key_name, encrypted_value, hint, updated_at) VALUES (?,?,?,?)'
    )
    upsert.run('GMAIL_CLIENT_ID', safeStorage.encryptString(clientId), '...' + clientId.slice(-4), Date.now())
    upsert.run('GMAIL_CLIENT_SECRET', safeStorage.encryptString(clientSecret), '****', Date.now())
  }

  // Open OAuth consent flow in default browser
  const { shell } = await import('electron')
  const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'
  const scopes = 'https://www.googleapis.com/auth/gmail.readonly'

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent`

  shell.openExternal(authUrl)

  return { isAuthenticated: false, email: null }
}

export async function exchangeAuthCode(code: string): Promise<GmailAuthStatus> {
  const clientId = getSecureKey('GMAIL_CLIENT_ID')
  const clientSecret = getSecureKey('GMAIL_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Gmail client credentials not found')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    }),
  })

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`)

  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number }

  storeTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
  })

  const profile = await gmailFetch('profile', data.access_token) as { emailAddress: string }
  return { isAuthenticated: true, email: profile.emailAddress }
}

export function logout(): void {
  clearTokens()
}

export async function listMessages(query = '', maxResults = 20): Promise<GmailMessage[]> {
  const token = await getValidToken()

  const q = query || 'in:inbox'
  const listData = await gmailFetch(
    `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
    token,
  ) as { messages?: Array<{ id: string; threadId: string }> }

  if (!listData.messages || listData.messages.length === 0) return []

  // Fetch full message data (batch up to 10 for speed)
  const messages: GmailMessage[] = []
  const batch = listData.messages.slice(0, maxResults)

  for (const msg of batch) {
    try {
      const full = await gmailFetch(`messages/${msg.id}?format=full`, token) as GmailApiMessage
      messages.push(parseMessage(full))
    } catch {
      // Skip individual message failures
    }
  }

  return messages
}

export async function readMessage(messageId: string): Promise<GmailMessage> {
  const token = await getValidToken()
  const full = await gmailFetch(`messages/${messageId}?format=full`, token) as GmailApiMessage
  return parseMessage(full)
}

export async function extractCode(messageId: string): Promise<GmailExtractionResult> {
  const message = await readMessage(messageId)

  const result = await orchestratedPrompt({
    sagaId: `gmail-extract-${messageId}-${Date.now()}`,
    sagaName: 'Extract code from email',
    steps: [
      {
        name: 'extract-via-ai',
        execute: async () => {
          const res = await pluginPrompt({
            pluginId: PLUGIN_ID,
            templateId: 'extract',
            vars: { emailBody: message.body },
          })
          return res.text
        },
      },
    ],
  })

  const rawText = result.results[0] as string
  let items: ExtractedItem[] = []
  try {
    const parsed = JSON.parse(rawText)
    items = parsed.items ?? parsed
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        items = parsed.items ?? []
      } catch {}
    }
  }

  return { messageId, items, summary: '' }
}

export async function summarizeMessage(messageId: string): Promise<string> {
  const message = await readMessage(messageId)

  const res = await pluginPrompt({
    pluginId: PLUGIN_ID,
    templateId: 'summarize',
    vars: { emailBody: message.body },
  })

  return res.text
}

// --- Gmail API Response Parsing ---

interface GmailApiMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{
      mimeType: string
      body?: { data?: string }
      parts?: Array<{ mimeType: string; body?: { data?: string } }>
    }>
  }
  internalDate: string
}

function parseMessage(raw: GmailApiMessage): GmailMessage {
  const headers = raw.payload.headers
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: getHeader('From'),
    subject: getHeader('Subject'),
    snippet: raw.snippet,
    body: extractBody(raw.payload),
    date: parseInt(raw.internalDate, 10),
    isRead: !raw.labelIds.includes('UNREAD'),
    labels: raw.labelIds,
  }
}

function extractBody(payload: GmailApiMessage['payload']): string {
  // Try plain text first, then HTML
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  if (payload.parts) {
    // Look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
      // Nested multipart
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === 'text/plain' && sub.body?.data) {
            return decodeBase64Url(sub.body.data)
          }
        }
      }
    }

    // Fallback to HTML
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data))
      }
    }
  }

  return ''
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
