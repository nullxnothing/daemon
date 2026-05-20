import { useState } from 'react'
import { BondingCurveCanvas } from './BondingCurveCanvas'
import { getSolscanTxLabel } from '../../../lib/solanaExplorer'
import { describePumpfunError, openPumpfunSignature, shortSignature } from './pumpfunUi'

interface BondingCurveInfo {
  mint: string
  currentPriceLamports: string
  marketCapLamports: string
  graduationBps: number
  isGraduated: boolean
  virtualSolReserves: string
  virtualTokenReserves: string
  realSolReserves: string
  realTokenReserves: string
}

interface Props {
  walletId: string | null
  cluster: WalletInfrastructureSettings['cluster']
}

const SLIPPAGE_OPTIONS = [50, 100, 300, 500]

function formatPrice(sol: number): string {
  if (sol === 0) return '0'
  if (sol >= 0.01) return sol.toFixed(4)
  // Show up to 6 significant digits for tiny prices
  const s = sol.toExponential(5)
  const [mantissa, exp] = s.split('e')
  const e = parseInt(exp)
  if (e >= -8) return sol.toFixed(Math.abs(e) + 2)
  return s
}

export function TradeTab({ walletId, cluster }: Props) {
  const [mint, setMint] = useState('')
  const [curve, setCurve] = useState<BondingCurveInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(100)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<{ signature?: string; error?: string } | null>(null)

  const loadCurve = async (clearResult = true) => {
    if (!mint.trim()) return
    setLoading(true)
    if (clearResult) setCurve(null)
    if (clearResult) setResult(null)

    try {
      const res = await window.daemon.pumpfun.bondingCurve(mint.trim())
      if (res.ok && res.data) {
        setCurve(res.data as BondingCurveInfo)
      } else if (clearResult) {
        setResult({ error: describePumpfunError(res.error, 'Could not load the PumpFun bonding curve.') })
      }
    } catch (error) {
      if (clearResult) {
        setResult({ error: describePumpfunError(error instanceof Error ? error.message : null, 'Could not load the PumpFun bonding curve.') })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLoad = () => {
    void loadCurve(true)
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

    try {
      const res = action === 'buy'
        ? await window.daemon.pumpfun.buy(input)
        : await window.daemon.pumpfun.sell(input)

      if (res.ok && res.data) {
        setResult({ signature: (res.data as { signature: string }).signature })
        void loadCurve(false)
      } else {
        setResult({ error: describePumpfunError(res.error, 'PumpFun trade failed. Nothing was submitted.') })
      }
    } catch (error) {
      setResult({ error: describePumpfunError(error instanceof Error ? error.message : null, 'PumpFun trade failed. Nothing was submitted.') })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div>
      <div className="pf-field">
        <label className="pf-label">Token Mint Address</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="pf-input" placeholder="Paste mint address..." value={mint} onChange={(e) => setMint(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="pf-btn pf-btn-secondary" onClick={handleLoad} disabled={loading || !mint.trim()}>
            {loading ? '...' : 'Load'}
          </button>
        </div>
      </div>

      {curve && (
        <div className="pf-curve-info">
          <BondingCurveCanvas
            curve={curve}
            tradeAction={!curve.isGraduated ? action : undefined}
            tradeAmountSol={!curve.isGraduated && amount ? parseFloat(amount) || undefined : undefined}
          />
          <div className="pf-curve-row">
            <span className="pf-curve-label">Price</span>
            <span className="pf-curve-value">{formatPrice(Number(curve.currentPriceLamports) / 1e9)} SOL</span>
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
            <button type="button" className={action === 'buy' ? 'active-buy' : ''} onClick={() => setAction('buy')}>Buy</button>
            <button type="button" className={action === 'sell' ? 'active-sell' : ''} onClick={() => setAction('sell')}>Sell</button>
          </div>

          <div className="pf-field">
            <label className="pf-label">{action === 'buy' ? 'Amount (SOL)' : 'Amount (Tokens)'}</label>
            <input className="pf-input" type="number" step="0.001" min="0" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="pf-field">
            <label className="pf-label">Slippage</label>
            <div className="pf-slippage">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button type="button" key={bps} className={`pf-slippage-btn ${slippage === bps ? 'active' : ''}`} onClick={() => setSlippage(bps)}>
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
          <span>Trade confirmed. Receipt {shortSignature(result.signature)}.</span>
          <button type="button" className="pf-tx-link" onClick={() => void openPumpfunSignature(result.signature!, cluster)}>
            {getSolscanTxLabel(cluster)}
          </button>
        </div>
      )}

      {result?.error && <div className="pf-result error">{result.error}</div>}
    </div>
  )
}
