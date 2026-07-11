import { useRef } from 'react'
import { useAriaStore } from '../store/aria'
import { AgentTranscript } from '../panels/AgentWorkbench/AgentTranscript'
import { useStickyScroll } from '../hooks/useStickyScroll'
import { LiteComposer } from './LiteComposer'
import styles from './LiteChat.module.css'

interface LiteChatProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
}

export function LiteChat({ draft, onDraftChange, onSend }: LiteChatProps) {
  const turns = useAriaStore((s) => s.turns)
  const isLoading = useAriaStore((s) => s.isLoading)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useStickyScroll(scrollRef, [turns, isLoading])

  return (
    <div className={styles.chat}>
      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.thread}>
          <AgentTranscript turns={turns} isLoading={isLoading} />
        </div>
      </div>
      <div className={styles.dock}>
        <div className={styles.composer}>
          <LiteComposer
            value={draft}
            onChange={onDraftChange}
            onSend={onSend}
            placeholder="Message DAEMON"
            ariaLabel="Message DAEMON"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  )
}
