import { useState } from 'react'

interface Props { walletId: string | null }

export function FeesTab({ walletId }: Props) {
  const [collecting, setCollecting] = useState(false)
  const [result, setResult] = useState<{ signature?: string; error?: string } | null>(null)

  const handleCollect = async () => {
    if (!walletId) return
    setCollecting(true)
    setResult(null)

    const res = await window.daemon.pumpfun.collectFees(walletId)
    if (res.ok && res.data) {
      setResult({ signature: (res.data as { signature: string }).signature })
    } else {
      setResult({ error: res.error ?? 'Fee collection failed' })
    }
    setCollecting(false)
  }

  const openTx = (sig: string) => {
    window.daemon.shell.openExternal(`https://solscan.io/tx/${sig}`)
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
          Fees collected.{' '}
          <span className="pf-tx-link" onClick={() => openTx(result.signature!)}>
            {result.signature.slice(0, 20)}...
          </span>
        </div>
      )}

      {result?.error && <div className="pf-result error">{result.error}</div>}
    </div>
  )
}
