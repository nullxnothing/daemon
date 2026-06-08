import { ToolCallRow } from '../../components/Panel'
import type { AriaTurn, AriaToolCallLive } from '../../store/aria'
import { ApprovalCard } from './ApprovalCard'
import { PlanList } from './PlanList'
import { PatchProposalCard } from './PatchProposalCard'
import { MemorySuggestionCard } from './MemorySuggestionCard'

function toRowStatus(s: AriaToolCallLive['status']): 'pending' | 'running' | 'done' | 'error' {
  return s === 'rejected' ? 'error' : s
}

export function AgentTranscript({ turns, isLoading }: { turns: AriaTurn[]; isLoading: boolean }) {
  return (
    <div className="agent-tr">
      {turns.map((turn) => (
        <article key={turn.id} className={`agent-tr-turn ${turn.role}`}>
          <div className="agent-tr-role">{turn.role === 'user' ? 'You' : 'ARIA'}</div>

          {turn.plan && turn.plan.length > 0 && <PlanList steps={turn.plan} />}

          {turn.toolCalls.length > 0 && (
            <div className="agent-tr-tools">
              {turn.toolCalls
                .filter((tc) => tc.name !== 'present_plan' && tc.name !== 'propose_patch')
                .map((tc) => (
                  <ToolCallRow
                    key={tc.callId}
                    kind={tc.toolKind}
                    label={tc.label}
                    meta={tc.meta}
                    status={toRowStatus(tc.status)}
                  />
                ))}
            </div>
          )}

          {turn.approvals.map((a) => (
            <ApprovalCard key={a.callId} approval={a} />
          ))}

          {turn.text ? <div className="agent-tr-text">{turn.text}</div> : null}

          {turn.patch && <PatchProposalCard patch={turn.patch} actionState={turn.actionState} />}

          {(turn.memorySuggestions ?? []).map((m) => (
            <MemorySuggestionCard key={m.id} suggestion={m} />
          ))}
        </article>
      ))}
      {isLoading ? <div className="agent-tr-thinking">Working…</div> : null}
    </div>
  )
}
