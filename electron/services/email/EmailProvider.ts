import type { EmailAccountRow, EmailMessage } from '../../shared/types'

export interface SendEmailInput {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  replyToMessageId?: string
}

export interface EmailProvider {
  testConnection(account: EmailAccountRow): Promise<boolean>
  fetchMessages(account: EmailAccountRow, query: string, max: number): Promise<EmailMessage[]>
  fetchMessage(account: EmailAccountRow, messageId: string): Promise<EmailMessage>
  getUnreadCount(account: EmailAccountRow): Promise<number>
  sendEmail(account: EmailAccountRow, input: SendEmailInput): Promise<{ messageId: string }>
  markAsRead(account: EmailAccountRow, messageIds: string[]): Promise<void>
}
