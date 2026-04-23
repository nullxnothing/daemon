import type { EmailMessage } from '../../../types/daemon.d'
import { useEmailStore } from '../../../store/email'

interface MessageItemProps {
  message: EmailMessage
  isSelected: boolean
  isUnified: boolean
  onClick: () => void
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&#39;': "'",
    '&#x27;': "'",
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&#x2F;': '/',
    '&apos;': "'",
    '&#8217;': '\u2019',
    '&#8216;': '\u2018',
    '&#8220;': '\u201C',
    '&#8221;': '\u201D',
    '&#8230;': '\u2026',
    '&#8211;': '\u2013',
    '&#8212;': '\u2014',
  }
  let decoded = text
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replaceAll(entity, char)
  }
  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  return decoded
}

function parseSenderName(from: string): string {
  // "Name <email>" -> "Name"
  const match = from.match(/^(.+?)\s*<[^>]+>$/)
  if (match) return match[1].replace(/^["']|["']$/g, '').trim()
  // Already just an email
  if (from.includes('@')) {
    const local = from.split('@')[0]
    return local.charAt(0).toUpperCase() + local.slice(1)
  }
  return from
}

function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match) return match[1]
  if (from.includes('@')) return from
  return ''
}

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hues = [210, 340, 160, 30, 270, 190, 0, 50, 290, 120]
  const hue = hues[Math.abs(hash) % hues.length]
  return `hsl(${hue}, 55%, 45%)`
}

function detectTags(message: EmailMessage): string[] {
  const tags: string[] = []
  const lower = (message.subject + ' ' + message.snippet).toLowerCase()
  const labels = message.labels?.map((l) => l.toLowerCase()) ?? []

  if (labels.includes('category_promotions') || lower.includes('unsubscribe') || lower.includes('newsletter')) {
    tags.push('Newsletter')
  }
  if (lower.includes('receipt') || lower.includes('invoice') || lower.includes('order confirmation') || lower.includes('payment')) {
    tags.push('Receipt')
  }
  if (lower.includes('```') || lower.includes('function ') || lower.includes('const ') || lower.includes('import ')) {
    tags.push('Has Code')
  }
  return tags
}

export function MessageItem({ message, isSelected, isUnified, onClick }: MessageItemProps) {
  const selectMode = useEmailStore((s) => s.selectMode)
  const selectedIds = useEmailStore((s) => s.selectedIds)
  const toggleSelected = useEmailStore((s) => s.toggleSelected)

  const senderName = parseSenderName(message.from)
  const senderEmail = parseSenderEmail(message.from)
  const avatarColor = nameToColor(senderName)
  const initial = senderName.charAt(0).toUpperCase()
  const snippet = decodeHtmlEntities(message.snippet).slice(0, 80)
  const subject = decodeHtmlEntities(message.subject)
  const tags = detectTags(message)
  const isChecked = selectedIds.has(message.id)

  const classList = [
    'email__msg',
    isSelected && 'email__msg--selected',
    !message.isRead && 'email__msg--unread',
  ].filter(Boolean).join(' ')

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleSelected(message.id)
  }

  return (
    <div className={classList} onClick={onClick}>
      {selectMode && (
        <div className="email__msg-checkbox" onClick={handleCheckbox}>
          <div className={`email__checkbox ${isChecked ? 'email__checkbox--checked' : ''}`}>
            {isChecked && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 5l2.5 2.5L8 3" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="email__msg-avatar" style={{ background: avatarColor }}>
        {initial}
      </div>

      <div className="email__msg-content">
        <div className="email__msg-top">
          <div className="email__msg-from-row">
            {isUnified && (
              <span className={`email__msg-provider email__msg-provider--${message.provider}`} />
            )}
            {!message.isRead && <span className="email__unread-dot" />}
            <span className="email__msg-from">{senderName}</span>
          </div>
          <span className="email__msg-date">{relativeTime(message.date)}</span>
        </div>

        <div className="email__msg-subject-row">
          <span className="email__msg-subject">{subject}</span>
          {snippet && (
            <>
              <span className="email__msg-sep"> -- </span>
              <span className="email__msg-snippet">{snippet}</span>
            </>
          )}
        </div>

        <div className="email__msg-bottom">
          <span className="email__msg-email" title={senderEmail}>{senderEmail}</span>
          <div className="email__msg-tags">
            {tags.map((tag) => (
              <span key={tag} className="email__msg-tag">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
