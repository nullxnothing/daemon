import { useState } from 'react'

interface BondingCurveInfo {
  mint: string
  currentPriceLamports: string
  marketCapLamports: string
  graduationBps: number
  isGraduated: boolean
  virtualSolReserves: string
  virtualTokenReserves: string
}

interface Props { walletId: string | null }

const SLIPPAGE_OPTIONS = [50, 100, 300, 500]

export function TradeTab({ walletId }: Props) {
  const [mint, setMint] = useState('')
  const [curve, setCurve] = useState<BondingCurveInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(100)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<{ signature?: string; error?: string } | null>(null)

  const handleLoad = async () => {
    if (!mint.trim()) return
    setLoading(true)
    setCurve(null)
    setResult(null)

    const res = await window.daemon.pumpfun.bondingCurve(mint.trim())
    if (res.ok && res.data) {
      setCurve(res.data as BondingCurveInfo)
    } else {
      setResult({ error: res.error ?? 'Failed to load bonding curve' })
    }
    setLoading(false)
  }

  const handleTrade = async () => {
    if (!walletId || !mint.trim() || !amount.trim()) return
    setExecuting(true)
    setResult(null)

    const input = {
      mint: mint.trim(),
      action,
      slippageBps: slippage,
      walletId,
      ...(action === 'buy' ? { amountSol: parseFloat(amount) } : { amountTokens: parseFloat(amount) }),
    }

    const res = action === 'buy'
      ? await window.daemon.pumpfun.buy(input)
      : await window.daemon.pumpfun.sell(input)

    if (res.ok && res.data) {
      setResult({ signature: (res.data as { signature: string }).signature })
      handleLoad() // Refresh curve state
    } else {
      setResult({ error: res.error ?? 'Trade failed' })
    }
    setExecuting(false)
  }

  const openTx = (sig: string) => {
    window.daemon.shell.openExternal(`https://solscan.io/tx/${sig}`)
  }

  return (
    <div>
      <div className="pf-field">
        <label className="pf-label">Token Mint Address</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="pf-input" placeholder="Paste mint address..." value={mint} onChange={(e) => setMint(e.target.value)} style={{ flex: 1 }} />
          <button className="pf-btn pf-btn-secondary" onClick={handleLoad} disabled={loading || !mint.trim()}>
            {loading ? '...' : 'Load'}
          </button>
        </div>
      </div>

      {curve && (
        <div className="pf-curve-info">
          <div className="pf-curve-row">
            <span className="pf-curve-label">Price</span>
            <span className="pf-curve-value">{(Number(curve.currentPriceLamports) / 1e9).toFixed(10)} SOL</span>
          </div>
          <div className="pf-curve-row">
            <span className="pf-curve-label">Market Cap</span>
            <span className="pf-curve-value">{(Number(curve.marketCapLamports) / 1e9).toFixed(2)} SOL</span>
          </div>
          <div className="pf-curve-row">
            <span className="pf-curve-label">Status</span>
            <span className="pf-curve-value" style={{ color: curve.isGraduated ? 'var(--green)' : 'var(--amber)' }}>
              {curve.isGraduated ? 'Graduated' : 'Bonding Curve'}
            </span>
          </div>
          <div className="pf-grad-bar">
            <div className="pf-grad-fill" style={{ width: `${Math.min(curve.graduationBps / 100, 100)}%` }} />
          </div>
          <div className="pf-grad-label">{(curve.graduationBps / 100).toFixed(1)}% to graduation</div>
        </div>
      )}

      {curve && !curve.isGraduated && (
        <>
          <div className="pf-action-toggle">
            <button className={action === 'buy' ? 'active-buy' : ''} onClick={() => setAction('buy')}>Buy</button>
            <button className={action === 'sell' ? 'active-sell' : ''} onClick={() => setAction('sell')}>Sell</button>
          </div>

          <div className="pf-field">
            <label className="pf-label">{action === 'buy' ? 'Amount (SOL)' : 'Amount (Tokens)'}</label>
            <input className="pf-input" type="number" step="0.001" min="0" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Slippage</label>
            <div className="pf-slippage">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button key={bps} className={`pf-slippage-btn ${slippage === bps ? 'active' : ''}`} onClick={() => setSlippage(bps)}>
                  {(bps / 100).toFixed(1)}%
                </button>
              ))}
            </div>
          </div>

          <button
            className={`pf-btn ${action === 'buy' ? 'pf-btn-primary' : 'pf-btn-danger'}`}
            style={{ width: '100%' }}
            onClick={handleTrade}
            disabled={executing || !walletId || !amount.trim()}
          >
            {executing ? 'Executing...' : action === 'buy' ? 'Buy Tokens' : 'Sell Tokens'}
          </button>
        </>
      )}

      {curve?.isGraduated && (
        <div className="pf-empty">Token has graduated. AMM trading coming soon.</div>
      )}

      {result?.signature && (
        <div className="pf-result success">
          Trade confirmed.{' '}
          <span className="pf-tx-link" onClick={() => openTx(result.signature!)}>
            {result.signature.slice(0, 20)}...
          </span>
        </div>
      )}

      {result?.error && <div className="pf-result error">{result.error}</div>}
    </div>
  )
}
