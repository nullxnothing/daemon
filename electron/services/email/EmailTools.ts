import * as EmailService from '../EmailService'
import type { EmailMessage } from '../../shared/types'

// MCP-style tool definitions for Claude agent access to email

export interface EmailToolSchema {
  name: string
  description: string
  parameters: Record<string, {
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
}

export interface CleanupSuggestions {
  old: EmailMessage[]
  newsletters: EmailMessage[]
  automated: EmailMessage[]
}

// --- Tool Schemas ---

export const EMAIL_TOOL_SCHEMAS: EmailToolSchema[] = [
  {
    name: 'email_list_accounts',
    description: 'List all connected email accounts with their status and unread counts',
    parameters: {},
  },
  {
    name: 'email_list_messages',
    description: 'List email messages from an account. Use accountId "all" to search across all accounts.',
    parameters: {
      accountId: { type: 'string', description: 'Account ID or "all" for all accounts', required: true },
      query: { type: 'string', description: 'Search query to filter messages' },
      maxResults: { type: 'number', description: 'Max messages to return (default 20)' },
    },
  },
  {
    name: 'email_read_message',
    description: 'Read the full content of a specific email message',
    parameters: {
      accountId: { type: 'string', description: 'Account ID', required: true },
      messageId: { type: 'string', description: 'Message ID', required: true },
    },
  },
  {
    name: 'email_extract_code',
    description: 'Extract code snippets, configs, error messages, and links from an email',
    parameters: {
      accountId: { type: 'string', description: 'Account ID', required: true },
      messageId: { type: 'string', description: 'Message ID', required: true },
    },
  },
  {
    name: 'email_summarize',
    description: 'Get an AI-generated summary of an email message',
    parameters: {
      accountId: { type: 'string', description: 'Account ID', required: true },
      messageId: { type: 'string', description: 'Message ID', required: true },
    },
  },
  {
    name: 'email_cleanup_suggestions',
    description: 'Get categorized cleanup suggestions: old emails (30+ days), newsletters, and automated notifications',
    parameters: {
      accountId: { type: 'string', description: 'Account ID', required: true },
    },
  },
]

// --- Tool Execution ---

export async function executeEmailTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'email_list_accounts':
      return handleListAccounts()
    case 'email_list_messages':
      return handleListMessages(params)
    case 'email_read_message':
      return handleReadMessage(params)
    case 'email_extract_code':
      return handleExtractCode(params)
    case 'email_summarize':
      return handleSummarize(params)
    case 'email_cleanup_suggestions':
      return handleCleanupSuggestions(params)
    default:
      throw new Error(`Unknown email tool: ${toolName}`)
  }
}

async function handleListAccounts() {
  const accounts = await EmailService.listAccounts()
  const unreadCounts = await EmailService.getUnreadCounts()
  return accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    email: a.email,
    status: a.status,
    unreadCount: unreadCounts[a.id] ?? 0,
  }))
}

async function handleListMessages(params: Record<string, unknown>) {
  const accountId = params.accountId as string
  if (!accountId) throw new Error('accountId is required')
  const query = (params.query as string) ?? undefined
  const maxResults = (params.maxResults as number) ?? undefined
  return EmailService.getMessages(accountId, query, maxResults)
}

async function handleReadMessage(params: Record<string, unknown>) {
  const accountId = params.accountId as string
  const messageId = params.messageId as string
  if (!accountId || !messageId) throw new Error('accountId and messageId are required')
  return EmailService.getMessage(accountId, messageId)
}

async function handleExtractCode(params: Record<string, unknown>) {
  const accountId = params.accountId as string
  const messageId = params.messageId as string
  if (!accountId || !messageId) throw new Error('accountId and messageId are required')
  return EmailService.extractCode(accountId, messageId)
}

async function handleSummarize(params: Record<string, unknown>) {
  const accountId = params.accountId as string
  const messageId = params.messageId as string
  if (!accountId || !messageId) throw new Error('accountId and messageId are required')
  return EmailService.summarizeMessage(accountId, messageId)
}

async function handleCleanupSuggestions(params: Record<string, unknown>) {
  const accountId = params.accountId as string
  if (!accountId) throw new Error('accountId is required')
  return EmailService.getCleanupSuggestions(accountId)
}

// --- Context Summary for Agent Prompts ---

export async function getEmailAccountSummary(): Promise<string> {
  try {
    const accounts = await EmailService.listAccounts()
    if (accounts.length === 0) return 'No email accounts connected.'

    const connected = accounts.filter((a) => a.status === 'connected')
    if (connected.length === 0) return `${accounts.length} email account(s) configured but none connected.`

    const unreadCounts = await EmailService.getUnreadCounts()
    const providerLabel: Record<string, string> = { gmail: 'Gmail', icloud: 'iCloud' }

    const parts = connected.map((a) => {
      const unread = unreadCounts[a.id] ?? 0
      const label = providerLabel[a.provider] ?? a.provider
      return `${a.email} (${label}, ${unread} unread)`
    })

    return `${connected.length} email account(s) connected: ${parts.join(', ')}`
  } catch (err) {
    console.warn('[EmailTools] failed to build account summary:', (err as Error).message)
    return 'Email status unavailable.'
  }
}

export const EMAIL_TOOL_NAMES = EMAIL_TOOL_SCHEMAS.map((t) => t.name).join(', ')
