import { Bug, CaretRight, ListChecks, MagnifyingGlass } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { LiteComposer } from './LiteComposer'
import styles from './LiteHome.module.css'

interface QuickAction {
  id: string
  title: string
  description: string
  prefill: string
  icon: Icon
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'explain',
    title: 'Explain code',
    description: 'Paste any code and get a plain-English walkthrough',
    prefill: 'Explain what this code does, step by step:\n\n',
    icon: MagnifyingGlass,
  },
  {
    id: 'debug',
    title: 'Debug an error',
    description: 'Find the likely cause and the fix',
    prefill: 'Help me debug this error:\n\n',
    icon: Bug,
  },
  {
    id: 'plan',
    title: 'Plan a project',
    description: 'Turn an idea into a step-by-step build plan',
    prefill: 'Help me plan this project: ',
    icon: ListChecks,
  },
]

interface LiteHomeProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onQuickAction: (prefill: string) => void
}

export function LiteHome({ draft, onDraftChange, onSend, onQuickAction }: LiteHomeProps) {
  return (
    <div className={styles.home}>
      <div className={styles.column}>
        <div className={styles.contextRow}>
          <span className={styles.contextName}>New chat</span>
          <span className={styles.contextSep} aria-hidden="true">·</span>
          <span className={styles.contextMeta}>This PC</span>
        </div>
        <LiteComposer
          value={draft}
          onChange={onDraftChange}
          onSend={onSend}
          placeholder="Ask anything. Paste code, an error, or an idea…"
          ariaLabel="Message ARIA"
          autoFocus
        />
        <div className={styles.actions}>
          {QUICK_ACTIONS.map((action) => {
            const Glyph = action.icon
            return (
              <button
                key={action.id}
                type="button"
                className={styles.action}
                onClick={() => onQuickAction(action.prefill)}
              >
                <Glyph size={15} className={styles.actionIcon} aria-hidden="true" />
                <span className={styles.actionTitle}>{action.title}</span>
                <span className={styles.actionDesc}>{action.description}</span>
                <CaretRight size={12} className={styles.actionChevron} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </div>
      <div className={styles.hint}>
        Chats stay on this device. Your API key never leaves your machine.
      </div>
    </div>
  )
}
