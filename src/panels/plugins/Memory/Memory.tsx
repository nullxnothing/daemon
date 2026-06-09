import { useEffect, useMemo } from 'react'
import type { KnowledgeItem, ProjectMemory } from '../../../../electron/shared/types'
import { useMemoryStore } from '../../../store/memory'
import { useUIStore } from '../../../store/ui'
import { PanelHeader } from '../../../components/Panel'
import { Dot } from '../../../components/Dot'
import '../plugin.css'
import './Memory.css'

// Secret classes are never injected; surfaced here only so the user can see/reject them.
const SECRET_CLASSES = new Set(['env_secret', 'wallet_secret', 'financial_tx', 'personal_data'])

const SOURCE_LABEL: Record<string, string> = {
  operator: 'you told me',
  operator_capture: 'learned from my work',
  extractor: 'auto-detected',
  check_runner: 'verified by a check',
  guard: 'flagged by guard',
}

function sourceLabel(sourceType: string): string {
  return SOURCE_LABEL[sourceType] ?? sourceType.replace(/_/g, ' ')
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const day = 86_400_000
  if (diff < day) return 'today'
  const days = Math.floor(diff / day)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function classDot(memory: ProjectMemory): 'green' | 'amber' | 'red' {
  if (SECRET_CLASSES.has(memory.privacyClass)) return 'red'
  return memory.privacyClass === 'public' ? 'green' : 'amber'
}

function KnowledgeRow({ item }: { item: KnowledgeItem }) {
  const remove = useMemoryStore((s) => s.remove)
  const stale = item.usageCount === 0 && Date.now() - item.createdAt > 14 * 86_400_000
  return (
    <li className="mem-row">
      <span className="mem-dot"><Dot color="green" /></span>
      <div className="mem-body">
        <div className="mem-kind">{item.kind.replace(/_/g, ' ')}</div>
        <div className="mem-value">{item.value}</div>
        <div className="mem-source">
          {sourceLabel(item.sourceType)} · learned {relativeTime(item.createdAt)}
          {' · '}used {item.usageCount}×
          {' · '}conf {Math.round(item.confidence * 100)}%
          {stale && <span className="mem-stale"> · unused — still true?</span>}
        </div>
      </div>
      <div className="mem-actions">
        <button className="mem-btn reject" onClick={() => remove(item.id)}>Forget</button>
      </div>
    </li>
  )
}

function MemoryRow({ memory, suggested }: { memory: ProjectMemory; suggested: boolean }) {
  const approve = useMemoryStore((s) => s.approve)
  const reject = useMemoryStore((s) => s.reject)
  const remove = useMemoryStore((s) => s.remove)
  return (
    <li className="mem-row">
      <span className="mem-dot"><Dot color={classDot(memory)} /></span>
      <div className="mem-body">
        <div className="mem-kind">{memory.kind.replace(/_/g, ' ')}</div>
        <div className="mem-value">{memory.value}</div>
        <div className="mem-source">{memory.sourceType} · conf {Math.round(memory.confidence * 100)}%</div>
      </div>
      <div className="mem-actions">
        {suggested && <button className="mem-btn approve" onClick={() => approve(memory.id)}>Approve</button>}
        {suggested
          ? <button className="mem-btn reject" onClick={() => reject(memory.id)}>Reject</button>
          : <button className="mem-btn reject" onClick={() => remove(memory.id)}>Remove</button>}
      </div>
    </li>
  )
}

export default function Memory() {
  const projectId = useUIStore((s) => s.activeProjectId)
  const projectPath = useUIStore((s) => s.activeProjectPath)
  const { memories, knowledge, isLoading, isExtracting, load, extract } = useMemoryStore()

  useEffect(() => { void load(projectId) }, [projectId, load])

  const suggestions = useMemo(() => memories.filter((m) => m.status === 'suggested'), [memories])

  return (
    <div className="plugin-panel mem-panel">
      <PanelHeader
        kicker="Guard & Memory"
        brandKicker
        title="What DAEMON Knows"
        subtitle={`${knowledge.length} fact${knowledge.length === 1 ? '' : 's'} learned about this project — injected into every agent turn.`}
        actions={
          <button
            className="mem-btn extract"
            disabled={!projectPath || isExtracting}
            onClick={() => projectPath && extract(projectPath, projectId)}
          >
            {isExtracting ? 'Scanning…' : 'Extract from project'}
          </button>
        }
      />

      {!projectPath && <p className="plugin-placeholder">Open a project to extract and manage memory.</p>}

      {projectPath && (
        <div className="mem-scroll">
          <section className="mem-section">
            <h3 className="mem-heading">Suggestions {suggestions.length > 0 && `(${suggestions.length})`}</h3>
            {suggestions.length === 0
              ? <p className="plugin-placeholder">No pending suggestions.</p>
              : <ul className="mem-list">{suggestions.map((m) => <MemoryRow key={m.id} memory={m} suggested />)}</ul>}
          </section>

          <section className="mem-section">
            <h3 className="mem-heading">Knowledge {knowledge.length > 0 && `(${knowledge.length})`}</h3>
            {knowledge.length === 0
              ? <p className="plugin-placeholder">{isLoading ? 'Loading…' : 'Nothing learned yet. Approve a suggestion or tell the console to remember something.'}</p>
              : <ul className="mem-list">{knowledge.map((k) => <KnowledgeRow key={k.id} item={k} />)}</ul>}
          </section>
        </div>
      )}
    </div>
  )
}
