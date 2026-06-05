import { useEffect, useMemo } from 'react'
import type { ProjectMemory } from '../../../../electron/shared/types'
import { useMemoryStore } from '../../../store/memory'
import { useUIStore } from '../../../store/ui'
import { PanelHeader } from '../../../components/Panel'
import { Dot } from '../../../components/Dot'
import '../plugin.css'
import './Memory.css'

// Secret classes are never injected; surfaced here only so the user can see/reject them.
const SECRET_CLASSES = new Set(['env_secret', 'wallet_secret', 'financial_tx', 'personal_data'])

function classDot(memory: ProjectMemory): 'green' | 'amber' | 'red' {
  if (SECRET_CLASSES.has(memory.privacyClass)) return 'red'
  return memory.privacyClass === 'public' ? 'green' : 'amber'
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
  const { memories, isLoading, isExtracting, load, extract } = useMemoryStore()

  useEffect(() => { void load(projectId) }, [projectId, load])

  const suggestions = useMemo(() => memories.filter((m) => m.status === 'suggested'), [memories])
  const approved = useMemo(() => memories.filter((m) => m.status === 'approved'), [memories])

  return (
    <div className="plugin-panel mem-panel">
      <PanelHeader
        kicker="Guard & Memory"
        brandKicker
        title="Project Memory"
        subtitle="Approved, source-backed facts injected into agent prompts."
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
            <h3 className="mem-heading">Approved {approved.length > 0 && `(${approved.length})`}</h3>
            {approved.length === 0
              ? <p className="plugin-placeholder">{isLoading ? 'Loading…' : 'No approved memories yet.'}</p>
              : <ul className="mem-list">{approved.map((m) => <MemoryRow key={m.id} memory={m} suggested={false} />)}</ul>}
          </section>
        </div>
      )}
    </div>
  )
}
