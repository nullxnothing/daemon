import { useCallback, useMemo, useState } from 'react'
import type { ApprovalRequest, ApprovalStatus } from '../types'
import { demoApprovals } from '../data/demo'

type RelaySender = (event: {
  type: 'approval.approve' | 'approval.reject'
  payload?: Record<string, unknown>
}) => Promise<{ ok: boolean; error?: string | null }>

export function useApprovalQueue(sendRelayEvent?: RelaySender) {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(demoApprovals)
  const [lastActionError, setLastActionError] = useState<string | null>(null)

  const pendingCount = useMemo(
    () => approvals.filter((approval) => approval.status === 'pending').length,
    [approvals],
  )

  const updateApproval = useCallback(async (id: string, status: ApprovalStatus) => {
    setApprovals((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))

    if (status === 'approved' || status === 'rejected') {
      const result = await sendRelayEvent?.({
        type: status === 'approved' ? 'approval.approve' : 'approval.reject',
        payload: { approvalId: id, status },
      })

      if (result && !result.ok) setLastActionError(result.error ?? 'Approval relay failed')
      else setLastActionError(null)
    }
  }, [sendRelayEvent])

  const approve = useCallback((id: string) => updateApproval(id, 'approved'), [updateApproval])
  const reject = useCallback((id: string) => updateApproval(id, 'rejected'), [updateApproval])
  const reset = useCallback((id: string) => updateApproval(id, 'pending'), [updateApproval])

  const loadFromDesktop = useCallback((nextApprovals?: ApprovalRequest[]) => {
    if (!nextApprovals?.length) return
    setApprovals(nextApprovals)
  }, [])

  return {
    approvals,
    pendingCount,
    lastActionError,
    approve,
    reject,
    reset,
    loadFromDesktop,
  }
}
