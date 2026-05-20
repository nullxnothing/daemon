import { useState } from 'react'
import { getSolscanTxLabel } from '../../../lib/solanaExplorer'
import { describePumpfunError, openPumpfunSignature, shortSignature } from './pumpfunUi'

interface Props {
  walletId: string | null
  cluster: WalletInfrastructureSettings['cluster']
}

export function FeesTab({ walletId, cluster }: Props) {
  const [collecting, setCollecting] = useState(false)
  const [result, setResult] = useState<{ signature?: string; error?: string } | null>(null)

  const handleCollect = async () => {
    if (!walletId) return
    setCollecting(true)
    setResult(null)

    try {
      const res = await window.daemon.pumpfun.collectFees(walletId)
      if (res.ok && res.data) {
        setResult({ signature: (res.data as { signature: string }).signature })
      } else {
        setResult({ error: describePumpfunError(res.error, 'Fee collection failed. Nothing was submitted.') })
      }
    } catch (error) {
      setResult({ error: describePumpfunError(error instanceof Error ? error.message : null, 'Fee collection failed. Nothing was submitted.') })
    } finally {
      setCollecting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--t2)' }}>
        Collect accumulated creator fees from PumpFun tokens you launched.
      </div>

      <button
        className="pf-btn pf-btn-primary"
        style={{ width: '100%' }}
        onClick={handleCollect}
        disabled={collecting || !walletId}
      >
        {collecting ? 'Collecting...' : 'Collect Creator Fees'}
      </button>

      {result?.signature && (
        <div className="pf-result success">
          <span>Fees collected. Receipt {shortSignature(result.signature)}.</span>
          <button type="button" className="pf-tx-link" onClick={() => void openPumpfunSignature(result.signature!, cluster)}>
            {getSolscanTxLabel(cluster)}
          </button>
        </div>
      )}

      {result?.error && <div className="pf-result error">{result.error}</div>}
    </div>
  )
}
