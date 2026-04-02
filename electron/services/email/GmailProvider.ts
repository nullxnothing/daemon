import http from 'node:http'
import { safeStorage, shell } from 'electron'
import { getDb } from '../../db/db'
import { TIMEOUTS, API_ENDPOINTS } from '../../config/constants'
import type { EmailProvider } from './EmailProvider'
import type { EmailAccountRow, EmailMessage } from '../../shared/types'

// --- Gmail API Response Types ---

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

// --- Token Management ---

function decryptField(buf: Buffer | null): string | null {
  if (!buf) return null
  return safeStorage.decryptString(Buffer.from(buf))
}

function getSecureKey(name: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const db = getDb()
  const row = db.prepare('SELECT encrypted_value FROM secure_keys WHERE key_name = ?').get(name) as
    { encrypted_value: Buffer } | undefined
  if (!row) return null
  return safeStorage.decryptString(Buffer.from(row.encrypted_value))
}

function isTokenExpired(account: EmailAccountRow): boolean {
  if (!account.token_expiry) return true
  return Date.now() > account.token_expiry - TIMEOUTS.TOKEN_EXPIRY_BUFFER
}

async function refreshAccessToken(account: EmailAccountRow): Promise<{ accessToken: string; refreshToken: string; expiry: number }> {
  const clientId = account.client_id_ref ? getSecureKey(account.client_id_ref) : null
  const clientSecret = account.client_secret_ref ? getSecureKey(account.client_secret_ref) : null
  const refreshToken = decryptField(account.refresh_token)

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials missing for token refresh')
  }

  const response = await fetch(API_ENDPOINTS.GOOGLE_OAUTH_TOKEN, {
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
  const newTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiry: Date.now() + data.expires_in * 1000,
  }

  // Persist refreshed tokens
  const db = getDb()
  db.prepare(
    'UPDATE email_accounts SET access_token = ?, refresh_token = ?, token_expiry = ?, updated_at = ? WHERE id = ?'
  ).run(
    safeStorage.encryptString(newTokens.accessToken),
    safeStorage.encryptString(newTokens.refreshToken),
    newTokens.expiry,
    Date.now(),
    account.id,
  )

  return newTokens
}

async function getValidToken(account: EmailAccountRow): Promise<string> {
  const accessToken = decryptField(account.access_token)
  if (!accessToken) throw new Error('No access token stored for this Gmail account')

  if (isTokenExpired(account)) {
    const refreshed = await refreshAccessToken(account)
    return refreshed.accessToken
  }

  return accessToken
}

async function gmailFetch(endpoint: string, token: string): Promise<unknown> {
  const response = await fetch(`${API_ENDPOINTS.GMAIL_API_BASE}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gmail API error ${response.status}: ${text}`)
  }

  return response.json()
}

// --- Message Parsing ---

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

function extractBody(payload: GmailApiMessage['payload']): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === 'text/plain' && sub.body?.data) {
            return decodeBase64Url(sub.body.data)
          }
        }
      }
    }

    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data))
      }
    }
  }

  return ''
}

function parseMessage(raw: GmailApiMessage, accountId: string): EmailMessage {
  const headers = raw.payload.headers
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  return {
    id: raw.id,
    accountId,
    provider: 'gmail',
    from: getHeader('From'),
    subject: getHeader('Subject'),
    snippet: raw.snippet,
    body: extractBody(raw.payload),
    date: parseInt(raw.internalDate, 10),
    isRead: !raw.labelIds.includes('UNREAD'),
    labels: raw.labelIds,
  }
}

// --- OAuth Flow Helpers (used by EmailService) ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Loopback OAuth: spins up a temp server, opens browser, catches the callback automatically. */
export async function performGmailOAuth(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string; expiry: number; email: string }> {
  const code = await captureAuthCode(clientId)
  return exchangeGmailCode(clientId, clientSecret, code)
}

function captureAuthCode(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // M-02: generate a per-flow CSRF state token before the server starts
    const oauthState = crypto.randomUUID()

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')

      res.writeHead(200, { 'Content-Type': 'text/html' })

      // M-02: reject callbacks whose state doesn't match
      if (returnedState !== oauthState) {
        res.end('<html><body style="background:#0a0a0a;color:#ef5350;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Authorization Failed</h2><p>Invalid state parameter.</p></div></body></html>')
        server.close()
        reject(new Error('OAuth state mismatch — possible CSRF'))
        return
      }

      if (code) {
        res.end('<html><body style="background:#0a0a0a;color:#f0f0f0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#3ecf8e">Connected</h2><p>You can close this tab and return to DAEMON.</p></div></body></html>')
        server.close()
        resolve(code)
      } else {
        // M-03: HTML-encode the error value before reflecting it into the response
        const safeError = escapeHtml(error ?? 'Unknown error')
        res.end('<html><body style="background:#0a0a0a;color:#ef5350;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Authorization Failed</h2><p>' + safeError + '</p></div></body></html>')
        server.close()
        reject(new Error(error ?? 'OAuth denied'))
      }
    })

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') { reject(new Error('Failed to start OAuth server')); return }
      const port = addr.port
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const scopes = 'https://www.googleapis.com/auth/gmail.readonly'

      // M-02: include state in the authorization URL
      const authUrl = `${API_ENDPOINTS.GOOGLE_OAUTH_AUTH}?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(oauthState)}`

      shell.openExternal(authUrl)

      // Auto-close after 5 minutes if no callback
      setTimeout(() => {
        server.close()
        reject(new Error('Gmail authorization timed out'))
      }, 5 * 60 * 1000)
    })

    // Store the port so exchangeGmailCode can use the same redirect URI
    ;(server as unknown as { _oauthPort?: number })._oauthPort = 0
    server.on('listening', () => {
      const addr = server.address()
      if (addr && typeof addr !== 'string') {
        activeOAuthPort = addr.port
      }
    })
  })
}

let activeOAuthPort = 0

async function exchangeGmailCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiry: number; email: string }> {
  const redirectUri = activeOAuthPort
    ? `http://127.0.0.1:${activeOAuthPort}/callback`
    : 'urn:ietf:wg:oauth:2.0:oob'

  const response = await fetch(API_ENDPOINTS.GOOGLE_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`)

  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number }

  const profile = await gmailFetch('profile', data.access_token) as { emailAddress: string }

  activeOAuthPort = 0

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiry: Date.now() + data.expires_in * 1000,
    email: profile.emailAddress,
  }
}

// --- Provider Implementation ---

export const gmailProvider: EmailProvider = {
  async testConnection(account: EmailAccountRow): Promise<boolean> {
    try {
      const token = await getValidToken(account)
      await gmailFetch('profile', token)
      return true
    } catch {
      return false
    }
  },

  async fetchMessages(account: EmailAccountRow, query: string, max: number): Promise<EmailMessage[]> {
    const token = await getValidToken(account)
    const q = query || 'in:inbox'

    const listData = await gmailFetch(
      `messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
      token,
    ) as { messages?: Array<{ id: string; threadId: string }> }

    if (!listData.messages || listData.messages.length === 0) return []

    const messages: EmailMessage[] = []
    const batch = listData.messages.slice(0, max)

    for (const msg of batch) {
      try {
        const full = await gmailFetch(`messages/${msg.id}?format=full`, token) as GmailApiMessage
        messages.push(parseMessage(full, account.id))
      } catch {
        // Skip individual message failures
      }
    }

    return messages
  },

  async fetchMessage(account: EmailAccountRow, messageId: string): Promise<EmailMessage> {
    const token = await getValidToken(account)
    const full = await gmailFetch(`messages/${messageId}?format=full`, token) as GmailApiMessage
    return parseMessage(full, account.id)
  },

  async getUnreadCount(account: EmailAccountRow): Promise<number> {
    const token = await getValidToken(account)
    const listData = await gmailFetch(
      `messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=1`,
      token,
    ) as { resultSizeEstimate?: number }

    return listData.resultSizeEstimate ?? 0
  },
}
