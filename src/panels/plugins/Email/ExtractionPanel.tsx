import { useState } from 'react'
import type { ExtractionResult } from '../../../types/daemon.d'

interface ExtractionPanelProps {
  extraction: ExtractionResult | null
  loading: boolean
}

export function ExtractionPanel({ extraction, loading }: ExtractionPanelProps) {
  if (loading) {
    return (
      <div className="email-companion__extraction-col">
        <div className="email-companion__section-title">Extractions</div>
        <div className="email__loading">Extracting...</div>
      </div>
    )
  }

  if (!extraction || extraction.items.length === 0) {
    return (
      <div className="email-companion__extraction-col">
        <div className="email-companion__section-title">Extractions</div>
        <div className="email-companion__empty">
          No extractions yet. Click "Extract Code" to analyze this message.
        </div>
      </div>
    )
  }

  return (
    <div className="email-companion__extraction-col">
      <div className="email-companion__section-title">Extractions</div>
      <div className="email__extractions">
        {extraction.items.map((item, i) => (
          <ExtractionCard key={i} item={item} />
        ))}
      </div>
    </div>
  )
}

interface ExtractionCardProps {
  item: { type: string; content: string; language?: string; context: string }
}

function ExtractionCard({ item }: ExtractionCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleOpenInEditor = () => {
    const name = item.language ? `untitled.${item.language}` : 'untitled.txt'
    window.daemon.fs.createFile(name).then(() => {
      window.daemon.fs.writeFile(name, item.content)
    })
  }

  const typeLabel = item.language
    ? `${item.type} ${item.language}`
    : item.type

  return (
    <div className="email__extraction">
      <div className="email__extraction-type">{typeLabel}</div>
      <div className="email__extraction-content">{item.content}</div>
      {item.context && (
        <div className="email__extraction-context">{item.context}</div>
      )}
      <div className="email__extraction-actions">
        <button type="button" className="email__extraction-btn" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        {(item.type === 'code' || item.type === 'config') && (
          <button type="button" className="email__extraction-btn" onClick={handleOpenInEditor}>
            Open in Editor
          </button>
        )}
      </div>
    </div>
  )
}
