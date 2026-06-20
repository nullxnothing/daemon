import { useEffect } from 'react'
import { useBridgeStore } from '../store/bridge'
import { ApprovalCard } from '../panels/AgentWorkbench/ApprovalCard'
// The approval card styles live in the (lazy-loaded) workbench stylesheet —
// import it here so bridge approvals render even if the console never opened.
import '../panels/AgentWorkbench/AgentWorkbench.css'
import styles from './BridgeApprovalHost.module.css'

/** Overlay for approval requests arriving from external MCP agents (Claude
 *  Code, Cursor) via the DAEMON Bridge. Mounted once at the app root. */
export function BridgeApprovalHost() {
  const approvals = useBridgeStore((s) => s.approvals)
  const approve = useBridgeStore((s) => s.approve)
  const subscribe = useBridgeStore((s) => s.subscribe)

  useEffect(() => subscribe(), [subscribe])

  if (approvals.length === 0) return null
  return (
    <div className={styles.host}>
      <div className={styles.header}>
        <span className={styles.headerDot} />
        External agent request
        <span className={styles.headerHint}>via DAEMON Bridge</span>
      </div>
      {approvals.map((approval) => (
        <ApprovalCard key={approval.callId} approval={approval} onDecide={approve} />
      ))}
    </div>
  )
}
