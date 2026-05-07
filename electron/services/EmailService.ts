import crypto from 'node:crypto'
import { safeStorage, shell } from 'electron'
import { getDb } from '../db/db'
import { LogService } from './LogService'
import { GOOGLE_OAUTH } from '../config/constants'
import { pluginPrompt, orchestratedPrompt } from './PluginPrompt'
import { buildUntrustedContext } from '../security/PrivacyGuard'
import type { EmailProvider, SendEmailInput } from './email/EmailProvider'
import { gmailProvider, performGmailOAuth } from './email/GmailProvider'
import { icloudProvider } from './email/ICloudProvider'
import type { EmailAccount, EmailAccountRow, EmailMessage, ExtractionResult, ExtractedItem } from '../shared/types'

const PLUGIN_ID = 'gmail' // reuse existing gmail plugin prompt templates

// --- Provider Routing ---

function getProvider(providerName: string): EmailProvider {
  switch (providerName) {
    case 'gmail': return gmailProvider
    case 'icloud': return icloudProvider
    default: throw new Error(`Unknown email provider: ${providerName}`)
  }
}

function getAccountRow(accountId: string): EmailAccountRow {
  const db = getDb()
  const row = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(accountId) as EmailAccountRow | undefined
  if (!row) throw new Error(`Email account not found: ${accountId}`)
  return row
}

function rowToAccount(row: EmailAccountRow): EmailAccount {
  return {
    id: row.id,
    provider: row.provider as 'gmail' | 'icloud',
    email: row.email,
    display_name: row.display_name,
    status: row.status as 'connected' | 'error' | 'refreshing',
    last_sync_at: row.last_sync_at,
    settings: row.settings,
    created_at: row.created_at,
    unreadCount: 0,
  }
}

function storeSecureKey(keyName: string, value: string): void {
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO secure_keys (key_name, encrypted_value, hint, updated_at) VALUES (?,?,?,?)'
  ).run(keyName, safeStorage.encryptString(value), '****', Date.now())
}

function getSecureKey(name: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const db = getDb()
  const row = db.prepare('SELECT encrypted_value FROM secure_keys WHERE key_name = ?').get(name) as
    { encrypted_value: Buffer } | undefined
  if (!row) return null
  return safeStorage.decryptString(Buffer.from(row.encrypted_value))
}

// --- Shared Gmail Credentials ---

const GMAIL_SHARED_CID_KEY = 'EMAIL_GMAIL_SHARED_CID'
const GMAIL_SHARED_CS_KEY = 'EMAIL_GMAIL_SHARED_CS'

export function hasGmailCredentials(): boolean {
  return !!getGmailCredentials()
}

export function storeGmailCredentials(clientId: string, clientSecret: string): void {
  storeSecureKey(GMAIL_SHARED_CID_KEY, clientId)
  storeSecureKey(GMAIL_SHARED_CS_KEY, clientSecret)
}

function getGmailCredentials(): { clientId: string; clientSecret: string } | null {
  // 1. Check user-stored credentials (from previous setup)
  const storedId = getSecureKey(GMAIL_SHARED_CID_KEY)
  const storedSecret = getSecureKey(GMAIL_SHARED_CS_KEY)
  if (storedId && storedSecret) return { clientId: storedId, clientSecret: storedSecret }

  // 2. Fall back to bundled credentials (set by app developer)
  if (GOOGLE_OAUTH.CLIENT_ID && GOOGLE_OAUTH.CLIENT_SECRET) {
    return { clientId: GOOGLE_OAUTH.CLIENT_ID, clientSecret: GOOGLE_OAUTH.CLIENT_SECRET }
  }

  return null
}

// --- Public API ---

export async function listAccounts(): Promise<EmailAccount[]> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM email_accounts ORDER BY created_at ASC').all() as EmailAccountRow[]
  return rows.map(rowToAccount)
}

/**
 * One-click Gmail OAuth. If clientId/clientSecret are provided, stores them as shared credentials.
 * If omitted, reuses previously stored shared credentials.
 */
export async function addGmailAccount(clientId?: string, clientSecret?: string): Promise<EmailAccount> {
  // Store new creds if provided, otherwise reuse existing
  if (clientId && clientSecret) {
    storeGmailCredentials(clientId, clientSecret)
  }

  const creds = getGmailCredentials()
  if (!creds) throw new Error('No Gmail credentials configured. Provide Client ID and Secret on first setup.')

  const accountId = crypto.randomUUID()
  const clientIdKey = `EMAIL_GMAIL_CID_${accountId.slice(0, 8)}`
  const clientSecretKey = `EMAIL_GMAIL_CS_${accountId.slice(0, 8)}`

  storeSecureKey(clientIdKey, creds.clientId)
  storeSecureKey(clientSecretKey, creds.clientSecret)

  // Perform the full OAuth flow (opens browser, catches callback automatically)
  const result = await performGmailOAuth(creds.clientId, creds.clientSecret)

  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO email_accounts (id, provider, email, display_name, client_id_ref, client_secret_ref, access_token, refresh_token, token_expiry, status, settings, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    accountId, 'gmail', result.email, null,
    clientIdKey, clientSecretKey,
    safeStorage.encryptString(result.accessToken),
    safeStorage.encryptString(result.refreshToken),
    result.expiry,
    'connected', '{}', now, now,
  )

  return rowToAccount(getAccountRow(accountId))
}

export async function addICloudAccount(email: string, appPassword: string): Promise<EmailAccount> {
  const accountId = crypto.randomUUID()
  const now = Date.now()
  const db = getDb()

  // Insert with encrypted password first
  db.prepare(
    `INSERT INTO email_accounts (id, provider, email, display_name, imap_password, status, settings, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(accountId, 'icloud', email, null, safeStorage.encryptString(appPassword), 'refreshing', '{}', now, now)

  // Test connection
  const row = getAccountRow(accountId)
  const connected = await icloudProvider.testConnection(row)

  if (!connected) {
    db.prepare('DELETE FROM email_accounts WHERE id = ?').run(accountId)
    throw new Error('Failed to connect to iCloud. Check email and app-specific password.')
  }

  db.prepare("UPDATE email_accounts SET status = 'connected', updated_at = ? WHERE id = ?").run(Date.now(), accountId)

  return rowToAccount(getAccountRow(accountId))
}

export async function removeAccount(accountId: string): Promise<void> {
  const db = getDb()
  const row = getAccountRow(accountId)

  db.transaction(() => {
    // Clean up secure keys for Gmail
    if (row.client_id_ref) {
      db.prepare('DELETE FROM secure_keys WHERE key_name = ?').run(row.client_id_ref)
    }
    if (row.client_secret_ref) {
      db.prepare('DELETE FROM secure_keys WHERE key_name = ?').run(row.client_secret_ref)
    }

    db.prepare('DELETE FROM email_message_cache WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM email_accounts WHERE id = ?').run(accountId)
  })()
}

export async function getMessages(accountId: string, query?: string, max?: number): Promise<EmailMessage[]> {
  const maxResults = max ?? 20
  const searchQuery = query ?? ''

  if (accountId === 'all') {
    const accounts = await listAccounts()
    const allMessages: EmailMessage[] = []

    const results = await Promise.allSettled(
      accounts
        .filter((a) => a.status === 'connected')
        .map(async (a) => {
          const row = getAccountRow(a.id)
          const provider = getProvider(a.provider)
          return provider.fetchMessages(row, searchQuery, maxResults)
        })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allMessages.push(...result.value)
      }
    }

    allMessages.sort((a, b) => b.date - a.date)
    return allMessages.slice(0, maxResults)
  }

  const row = getAccountRow(accountId)
  const provider = getProvider(row.provider)
  return provider.fetchMessages(row, searchQuery, maxResults)
}

export async function getMessage(accountId: string, messageId: string): Promise<EmailMessage> {
  const row = getAccountRow(accountId)
  const provider = getProvider(row.provider)
  return provider.fetchMessage(row, messageId)
}

export async function sendEmail(accountId: string, input: SendEmailInput): Promise<{ messageId: string }> {
  const row = getAccountRow(accountId)
  const provider = getProvider(row.provider)
  return provider.sendEmail(row, input)
}

export async function markAsRead(accountId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return
  const row = getAccountRow(accountId)
  const provider = getProvider(row.provider)
  await provider.markAsRead(row, messageIds)
}

export async function markAllAsRead(accountId?: string): Promise<number> {
  const targetAccounts = accountId && accountId !== 'all'
    ? [getAccountRow(accountId)]
    : (await listAccounts()).filter((a) => a.status === 'connected').map((a) => getAccountRow(a.id))

  let totalMarked = 0

  for (const row of targetAccounts) {
    try {
      const provider = getProvider(row.provider)
      const messages = await provider.fetchMessages(row, 'is:unread', 50)
      const unreadIds = messages.filter((m) => !m.isRead).map((m) => m.id)
      if (unreadIds.length > 0) {
        await provider.markAsRead(row, unreadIds)
        totalMarked += unreadIds.length
      }
    } catch {
      // Continue with other accounts on failure
    }
  }

  return totalMarked
}

export async function extractCode(accountId: string, messageId: string): Promise<ExtractionResult> {
  const message = await getMessage(accountId, messageId)

  const result = await orchestratedPrompt({
    sagaId: `email-extract-${messageId}-${Date.now()}`,
    sagaName: 'Extract code from email',
    steps: [
      {
        name: 'extract-via-ai',
        execute: async () => {
          const res = await pluginPrompt({
            pluginId: PLUGIN_ID,
            templateId: 'extract',
            vars: { emailBody: buildUntrustedContext('email_body', message.body) },
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
      } catch (err) {
        LogService.warn('EmailService', 'JSON extraction fallback failed: ' + (err as Error).message)
      }
    }
  }

  return { messageId, items, summary: '' }
}

export async function summarizeMessage(accountId: string, messageId: string): Promise<string> {
  const message = await getMessage(accountId, messageId)

  const res = await pluginPrompt({
    pluginId: PLUGIN_ID,
    templateId: 'summarize',
    vars: { emailBody: buildUntrustedContext('email_body', message.body) },
  })

  return res.text
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  const accounts = await listAccounts()
  const counts: Record<string, number> = {}

  const results = await Promise.allSettled(
    accounts
      .filter((a) => a.status === 'connected')
      .map(async (a) => {
        const row = getAccountRow(a.id)
        const provider = getProvider(a.provider)
        const count = await provider.getUnreadCount(row)
        return { id: a.id, count }
      })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      counts[result.value.id] = result.value.count
    }
  }

  return counts
}

export async function getCleanupSuggestions(accountId: string): Promise<{
  old: EmailMessage[]
  newsletters: EmailMessage[]
  automated: EmailMessage[]
}> {
  const messages = await getMessages(accountId, undefined, 100)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  const newsletterPatterns = /newsletter|noreply|no-reply|notifications?@|marketing|digest|weekly|unsubscribe/i
  const automatedPatterns = /github\.com|vercel\.com|railway\.app|jira|linear\.app|gitlab\.com|bitbucket\.org|circleci\.com|netlify\.com|sentry\.io/i

  const old: EmailMessage[] = []
  const newsletters: EmailMessage[] = []
  const automated: EmailMessage[] = []

  for (const msg of messages) {
    if (msg.date < thirtyDaysAgo) old.push(msg)

    const fromAndSubject = `${msg.from} ${msg.subject}`
    if (newsletterPatterns.test(fromAndSubject)) {
      newsletters.push(msg)
    } else if (automatedPatterns.test(msg.from)) {
      automated.push(msg)
    }
  }

  return { old, newsletters, automated }
}

const VALID_SETTINGS_KEYS = new Set([
  'autoSync', 'syncInterval', 'maxMessages', 'notifications', 'signature',
])

export async function updateSettings(accountId: string, settings: string): Promise<void> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(settings)
  } catch {
    throw new Error('Invalid settings: not valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid settings: must be a JSON object')
  }

  const unknownKeys = Object.keys(parsed).filter((k) => !VALID_SETTINGS_KEYS.has(k))
  if (unknownKeys.length > 0) {
    throw new Error(`Invalid settings keys: ${unknownKeys.join(', ')}`)
  }

  const db = getDb()
  db.prepare('UPDATE email_accounts SET settings = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(parsed), Date.now(), accountId)
}
