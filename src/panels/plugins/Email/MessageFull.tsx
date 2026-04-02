import type { EmailMessage } from '../../../types/daemon.d'

interface MessageFullProps {
  message: EmailMessage
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function MessageFull({ message }: MessageFullProps) {
  return (
    <div className="email-companion__message-col">
      <div className="email-companion__subject">{message.subject}</div>
      <div className="email-companion__meta">
        From: {message.from} &middot; {relativeTime(message.date)}
      </div>
      <div className="email-companion__body">{message.body}</div>
    </div>
  )
}
