import type { EmailAccountRow, EmailMessage } from '../../shared/types'

export interface EmailProvider {
  testConnection(account: EmailAccountRow): Promise<boolean>
  fetchMessages(account: EmailAccountRow, query: string, max: number): Promise<EmailMessage[]>
  fetchMessage(account: EmailAccountRow, messageId: string): Promise<EmailMessage>
  getUnreadCount(account: EmailAccountRow): Promise<number>
}
