import { safeStorage } from 'electron'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createTransport } from 'nodemailer'
import type { EmailProvider, SendEmailInput } from './EmailProvider'
import type { EmailAccountRow, EmailMessage } from '../../shared/types'

const ICLOUD_HOST = 'imap.mail.me.com'
const ICLOUD_PORT = 993
const ICLOUD_SMTP_HOST = 'smtp.mail.me.com'
const ICLOUD_SMTP_PORT = 587
const POOL_TTL_MS = 5 * 60 * 1000 // reuse connections within 5 minutes

interface PooledConnection {
  client: ImapFlow
  lastUsed: number
}

const connectionPool = new Map<string, PooledConnection>()

// Clean up idle connections every 60 seconds
const poolCleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of connectionPool) {
    if (now - entry.lastUsed > POOL_TTL_MS) {
      entry.client.logout().catch(() => {})
      connectionPool.delete(key)
    }
  }
}, 60_000)
if (typeof poolCleanupTimer.unref === 'function') poolCleanupTimer.unref()

function decryptPassword(account: EmailAccountRow): string {
  if (!account.imap_password) throw new Error('No iCloud password stored for this account')
  return safeStorage.decryptString(Buffer.from(account.imap_password))
}

function createClient(account: EmailAccountRow): ImapFlow {
  const password = decryptPassword(account)
  return new ImapFlow({
    host: ICLOUD_HOST,
    port: ICLOUD_PORT,
    secure: true,
    auth: {
      user: account.email,
      pass: password,
    },
    logger: false,
  })
}

async function getPooledClient(account: EmailAccountRow): Promise<{ client: ImapFlow; pooled: boolean }> {
  const key = account.id
  const existing = connectionPool.get(key)

  if (existing && Date.now() - existing.lastUsed < POOL_TTL_MS) {
    existing.lastUsed = Date.now()
    return { client: existing.client, pooled: true }
  }

  // Evict stale entry if present
  if (existing) {
    existing.client.logout().catch(() => {})
    connectionPool.delete(key)
  }

  const client = createClient(account)
  await client.connect()
  connectionPool.set(key, { client, lastUsed: Date.now() })
  return { client, pooled: true }
}

function returnToPool(account: EmailAccountRow): void {
  const entry = connectionPool.get(account.id)
  if (entry) entry.lastUsed = Date.now()
}

function evictFromPool(account: EmailAccountRow): void {
  const entry = connectionPool.get(account.id)
  if (entry) {
    entry.client.logout().catch(() => {})
    connectionPool.delete(account.id)
  }
}

function parseEnvelopeMessage(msg: { uid: number; envelope: any; source?: Buffer }, accountId: string): EmailMessage {
  const env = msg.envelope
  const from = env.from?.[0]
    ? `${env.from[0].name || ''} <${env.from[0].address || ''}>`.trim()
    : ''

  return {
    id: `icloud-${msg.uid}`,
    accountId,
    provider: 'icloud',
    from,
    subject: env.subject || '(No Subject)',
    snippet: '',
    body: '',
    date: env.date ? new Date(env.date).getTime() : Date.now(),
    isRead: false, // IMAP flags checked separately when available
    labels: [],
  }
}

export const icloudProvider: EmailProvider = {
  async testConnection(account: EmailAccountRow): Promise<boolean> {
    const client = createClient(account)
    try {
      await client.connect()
      return true
    } catch {
      return false
    } finally {
      try { await client.logout() } catch { /* ignore cleanup errors */ }
    }
  },

  async fetchMessages(account: EmailAccountRow, _query: string, max: number): Promise<EmailMessage[]> {
    const messages: EmailMessage[] = []
    let pooled = false

    try {
      const conn = await getPooledClient(account)
      pooled = conn.pooled
      const client = conn.client
      const lock = await client.getMailboxLock('INBOX')

      try {
        const mb = client.mailbox
        const totalMessages = mb ? mb.exists : 0
        if (totalMessages === 0) return []

        const startSeq = Math.max(1, totalMessages - max + 1)
        const range = `${startSeq}:*`

        for await (const msg of client.fetch(range, { envelope: true, flags: true })) {
          const parsed = parseEnvelopeMessage(msg as any, account.id)
          const flags = (msg as any).flags as Set<string> | undefined
          if (flags) {
            parsed.isRead = flags.has('\\Seen')
          }
          messages.push(parsed)
        }
      } finally {
        lock.release()
      }

      returnToPool(account)
    } catch (err) {
      evictFromPool(account)
      throw err
    }

    messages.sort((a, b) => b.date - a.date)
    return messages.slice(0, max)
  },

  async fetchMessage(account: EmailAccountRow, messageId: string): Promise<EmailMessage> {
    const uid = parseInt(messageId.replace('icloud-', ''), 10)
    if (isNaN(uid)) throw new Error(`Invalid iCloud message ID: ${messageId}`)

    try {
      const { client } = await getPooledClient(account)
      const lock = await client.getMailboxLock('INBOX')

      try {
        const rawMsg = await client.fetchOne(String(uid), { source: true, envelope: true, flags: true, uid: true })
        const source = (rawMsg as any).source as Buffer | undefined

        if (!source) {
          throw new Error(`Message ${messageId} has no source data`)
        }

        const parsed = await simpleParser(source)
        const flags = (rawMsg as any).flags as Set<string> | undefined

        returnToPool(account)
        return {
          id: messageId,
          accountId: account.id,
          provider: 'icloud',
          from: parsed.from?.text ?? '',
          subject: parsed.subject ?? '(No Subject)',
          snippet: (parsed.text ?? '').slice(0, 200),
          body: parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, '') : ''),
          date: parsed.date ? parsed.date.getTime() : Date.now(),
          isRead: flags ? flags.has('\\Seen') : false,
          labels: [],
        }
      } finally {
        lock.release()
      }
    } catch (err) {
      evictFromPool(account)
      throw err
    }
  },

  async getUnreadCount(account: EmailAccountRow): Promise<number> {
    try {
      const { client } = await getPooledClient(account)
      const mailbox = await client.status('INBOX', { unseen: true })
      returnToPool(account)
      return mailbox.unseen ?? 0
    } catch (err) {
      evictFromPool(account)
      throw err
    }
  },

  async sendEmail(account: EmailAccountRow, input: SendEmailInput): Promise<{ messageId: string }> {
    const password = decryptPassword(account)

    const transport = createTransport({
      host: ICLOUD_SMTP_HOST,
      port: ICLOUD_SMTP_PORT,
      secure: false,
      auth: {
        user: account.email,
        pass: password,
      },
    })

    const info = await transport.sendMail({
      from: account.email,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.body,
      inReplyTo: input.replyToMessageId,
    })

    return { messageId: info.messageId }
  },

  async markAsRead(account: EmailAccountRow, messageIds: string[]): Promise<void> {
    try {
      const { client } = await getPooledClient(account)
      const lock = await client.getMailboxLock('INBOX')

      try {
        for (const id of messageIds) {
          const uid = parseInt(id.replace('icloud-', ''), 10)
          if (isNaN(uid)) continue
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        }
      } finally {
        lock.release()
      }

      returnToPool(account)
    } catch (err) {
      evictFromPool(account)
      throw err
    }
  },
}
