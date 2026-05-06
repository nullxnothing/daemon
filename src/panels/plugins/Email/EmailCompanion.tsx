import { useState, useEffect } from 'react'
import { useEmailStore } from '../../../store/email'
import { MessageFull } from './MessageFull'
import { ExtractionPanel } from './ExtractionPanel'
import { SummaryCard } from './SummaryCard'
import './EmailCompanion.css'

export default function EmailCompanion() {
  const messages = useEmailStore((s) => s.messages)
  const companionMessageId = useEmailStore((s) => s.companionMessageId)
  const extractions = useEmailStore((s) => s.extractions)
  const summaries = useEmailStore((s) => s.summaries)
  const extractCode = useEmailStore((s) => s.extractCode)
  const summarize = useEmailStore((s) => s.summarize)
  const closeCompanion = useEmailStore((s) => s.closeCompanion)

  const [extracting, setExtracting] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  const message = messages.find((m) => m.id === companionMessageId)

  useEffect(() => {
    if (!companionMessageId) return
    // auto-extract on open if not already extracted
    const msg = messages.find((m) => m.id === companionMessageId)
    if (msg && !extractions[companionMessageId]) {
      setExtracting(true)
      extractCode(companionMessageId, msg.accountId).finally(() => setExtracting(false))
    }
  }, [companionMessageId, messages, extractions, extractCode])

  if (!message) {
    return (
      <div className="email-companion">
        <div className="email-companion__empty">
          Select a message and click "Open Full" to view it here.
        </div>
      </div>
    )
  }

  const extraction = extractions[message.id] ?? null
  const summary = summaries[message.id] ?? null

  const handleSummarize = async () => {
    setSummarizing(true)
    await summarize(message.id, message.accountId)
    setSummarizing(false)
  }

  return (
    <div className="email-companion">
      <div className="email-companion__header">
        <button type="button" className="email__view-back" onClick={closeCompanion}>
          Back
        </button>
        <span className="email-companion__breadcrumb">
          MAIL
          <span className="email-companion__breadcrumb-sep">&gt;</span>
          {message.from}
          <span className="email-companion__breadcrumb-sep">&gt;</span>
          <span className="email-companion__breadcrumb-active">{message.subject}</span>
        </span>
      </div>

      <div className="email-companion__content">
        <MessageFull message={message} />

        <div className="email-companion__extraction-col">
          <ExtractionPanel extraction={extraction} loading={extracting} />

          <div style={{ marginTop: 12 }}>
            {!summary && !summarizing && (
              <button type="button" className="email__action-btn" onClick={handleSummarize}>
                Summarize
              </button>
            )}
            <SummaryCard summary={summary} loading={summarizing} />
          </div>
        </div>
      </div>
    </div>
  )
}
