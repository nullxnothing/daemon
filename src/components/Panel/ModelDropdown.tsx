import { useAriaStore } from '../../store/aria'
import type { DaemonAiModelLane } from '../../../electron/shared/types'
import styles from './ModelDropdown.module.css'

const LANE_LABEL: Record<DaemonAiModelLane, string> = {
  auto: 'claude-sonnet-4.6',
  fast: 'claude-haiku-4.5',
  standard: 'claude-sonnet-4.6',
  reasoning: 'claude-opus-4.8',
  premium: 'claude-opus-4.8',
}

const FALLBACK_LANES: DaemonAiModelLane[] = ['auto', 'fast', 'standard', 'reasoning', 'premium']

/** Lane selector for the ARIA agent. Mirrors the composer's "claude-sonnet-4.6 ▾". */
export function ModelDropdown({ className }: { className?: string }) {
  const selectedLane = useAriaStore((s) => s.selectedLane)
  const setLane = useAriaStore((s) => s.setLane)
  const models = useAriaStore((s) => s.availableModels)

  const lanes = models.length ? models.map((m) => m.lane) : FALLBACK_LANES

  return (
    <label className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <span className="sr-only">Model</span>
      <select
        className={styles.select}
        value={selectedLane}
        onChange={(e) => setLane(e.currentTarget.value as DaemonAiModelLane)}
      >
        {lanes.map((lane) => {
          const info = models.find((m) => m.lane === lane)
          return (
            <option key={lane} value={lane}>
              {info ? `${info.label} · ${LANE_LABEL[lane]}` : LANE_LABEL[lane]}
            </option>
          )
        })}
      </select>
      <span className={styles.caret} aria-hidden="true">▾</span>
    </label>
  )
}
