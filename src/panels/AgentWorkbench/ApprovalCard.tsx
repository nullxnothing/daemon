import { useState } from 'react'
import { useAriaStore, type AriaApproval } from '../../store/aria'

const RISK_LABEL: Record<AriaApproval['risk'], string> = {
  read: 'READ',
  write: 'WRITE',
  sensitive: 'SENSITIVE',
}

const LAMPORTS_PER_SOL = 1_000_000_000

/** The fee line. Always visible when a fee applies — never buried. */
function FeeRow({ fee }: { fee: NonNullable<AriaApproval['fee']> }) {
  const sol = fee.lamports / LAMPORTS_PER_SOL
  return (
    <div className="agent-approval-fee">
      fee {(fee.bps / 100).toFixed(2)}% · {sol.toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL → daemon treasury
    </div>
  )
}

export function ApprovalCard({ approval }: { approval: AriaApproval }) {
  const approve = useAriaStore((s) => s.approve)
  const [typed, setTyped] = useState('')

  // Plan-mode gate: one approval to run the whole plan (sentinel name).
  if (approval.name === '__plan__') {
    return (
      <div className="agent-approval plan">
        <div className="agent-approval-head">
          <span className="agent-approval-risk plan">PLAN</span>
          <span className="agent-approval-name">Approve to run all steps</span>
        </div>
        <div className="agent-approval-summary">{approval.summary}</div>
        <div className="agent-approval-actions">
          <button type="button" className="agent-approval-reject" onClick={() => approve(approval.callId, false)}>
            Cancel
          </button>
          <button type="button" className="agent-approval-approve" onClick={() => approve(approval.callId, true)}>
            Approve plan
          </button>
        </div>
      </div>
    )
  }

  const isSensitive = approval.risk === 'sensitive'
  // For sensitive actions, require typing the first string argument (e.g. wallet
  // name) or the literal CONFIRM as a deliberate gate.
  const firstArg = approval.input && typeof approval.input === 'object'
    ? String(Object.values(approval.input as Record<string, unknown>)[0] ?? '')
    : ''
  const confirmTarget = firstArg || 'CONFIRM'
  const typedOk = !isSensitive || typed.trim() === confirmTarget

  return (
    <div className={`agent-approval ${approval.risk}`}>
      <div className="agent-approval-head">
        <span className={`agent-approval-risk ${approval.risk}`}>{RISK_LABEL[approval.risk]}</span>
        <span className="agent-approval-name">{approval.name}</span>
      </div>
      <div className="agent-approval-summary">{approval.summary}</div>
      {approval.fee ? <FeeRow fee={approval.fee} /> : null}

      {isSensitive ? (
        <label className="agent-approval-confirm">
          <span>Type <code>{confirmTarget}</code> to confirm</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            placeholder={confirmTarget}
            autoFocus
          />
        </label>
      ) : null}

      <div className="agent-approval-actions">
        <button type="button" className="agent-approval-reject" onClick={() => approve(approval.callId, false)}>
          Reject
        </button>
        <button
          type="button"
          className="agent-approval-approve"
          disabled={!typedOk}
          onClick={() => approve(approval.callId, true)}
        >
          Approve
        </button>
      </div>
    </div>
  )
}
