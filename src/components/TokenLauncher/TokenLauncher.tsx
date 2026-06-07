import { useState, useEffect, useCallback } from 'react'
import { getSolscanTxLabel } from '../../lib/solanaExplorer'
import { describePumpfunError, openPumpfunSignature, shortSignature } from '../../panels/plugins/PumpFunTool/pumpfunUi'
import styles from './TokenLauncher.module.css'

interface Props {
  walletId: string | null
  cluster: WalletInfrastructureSettings['cluster']
  /** When false, hides the "NEW LAUNCH" eyebrow (host already labels the section). */
  showLabel?: boolean
}

type Curve = 'linear' | 'exponential'

const CREATION_FEE_SOL = 0.02

/** Static SVG preview of the chosen bonding-curve shape (pre-launch). */
function CurvePreview({ curve }: { curve: Curve }) {
  const W = 270
  const H = 60
  const steps = 48
  let line = ''
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const y = curve === 'exponential' ? t * t : t
    line += `${i === 0 ? 'M' : 'L'}${(t * W).toFixed(1)} ${(H - 4 - y * (H - 10)).toFixed(1)} `
  }
  const area = `${line}L${W} ${H} L0 ${H} Z`
  return (
    <svg className={styles.curve} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.curveArea} d={area} />
      <path className={styles.curveLine} d={line} />
    </svg>
  )
}

/** pump.fun-style token launcher (mockups/plugin-panel.html). Shared by ClawPump + Token Launch. */
export function TokenLauncher({ walletId, cluster, showLabel = true }: Props) {
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [supply, setSupply] = useState('1,000,000,000')
  const [curve, setCurve] = useState<Curve>('linear')
  const [initialBuy, setInitialBuy] = useState('0.50')
  const [launching, setLaunching] = useState(false)
  const [result, setResult] = useState<{ signature?: string; mint?: string; error?: string } | null>(null)
  const [live, setLive] = useState<LaunchedToken[]>([])

  const loadLive = useCallback(async () => {
    if (!walletId) { setLive([]); return }
    const res = await window.daemon.launch.listTokens(walletId)
    if (res.ok && res.data) setLive(res.data as LaunchedToken[])
  }, [walletId])

  useEffect(() => { void loadLive() }, [loadLive])

  const handleLaunch = async () => {
    if (!walletId || !name.trim() || !symbol.trim()) return
    setLaunching(true)
    setResult(null)
    try {
      const res = await window.daemon.launch.createToken({
        launchpad: 'pumpfun',
        walletId,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: '',
        imagePath: null,
        twitter: '',
        telegram: '',
        website: '',
        initialBuySol: parseFloat(initialBuy) || 0,
        slippageBps: 1000,
        priorityFeeSol: 0.005,
        mayhemMode: false,
      })
      if (res.ok && res.data) {
        setResult({ signature: res.data.signature, mint: res.data.mint })
        void loadLive()
      } else {
        setResult({ error: describePumpfunError(res.error, 'Token launch failed. Nothing was submitted.') })
      }
    } catch (error) {
      setResult({ error: describePumpfunError(error instanceof Error ? error.message : null, 'Token launch failed. Nothing was submitted.') })
    } finally {
      setLaunching(false)
    }
  }

  const canLaunch = Boolean(walletId) && name.trim().length > 0 && symbol.trim().length > 0

  return (
    <div className={styles.launcher}>
      <div className={styles.psec}>
        {showLabel && <span className="label">New launch</span>}

        <input className={styles.field} placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} />

        <div className={styles.row2}>
          <input
            className={`${styles.field} ${styles.mono}`}
            placeholder="TICKER"
            value={symbol}
            maxLength={8}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          <input
            className={`${styles.field} ${styles.mono}`}
            placeholder="1,000,000,000"
            value={supply}
            onChange={(e) => setSupply(e.target.value)}
          />
        </div>

        <div className={styles.seg} role="group" aria-label="Bonding curve">
          <button type="button" className={curve === 'linear' ? styles.segOn : ''} aria-pressed={curve === 'linear'} onClick={() => setCurve('linear')}>linear</button>
          <button type="button" className={curve === 'exponential' ? styles.segOn : ''} aria-pressed={curve === 'exponential'} onClick={() => setCurve('exponential')}>exponential</button>
        </div>

        <CurvePreview curve={curve} />

        <div className={styles.kv}><span>Creation fee</span><b>◎ {CREATION_FEE_SOL.toFixed(2)}</b></div>
        <div className={styles.kv}>
          <span>Initial buy</span>
          <b>◎ <input className={styles.kvInput} type="number" step="0.01" min="0" value={initialBuy} onChange={(e) => setInitialBuy(e.target.value)} /></b>
        </div>

        <button className={styles.launchBtn} onClick={handleLaunch} disabled={launching || !canLaunch}>
          {launching ? 'Launching…' : 'Launch token'}
        </button>

        {result?.signature && (
          <div className={`${styles.result} ${styles.resultOk}`}>
            <span>Token launched{result.mint ? ` (${result.mint.slice(0, 6)}…${result.mint.slice(-4)})` : ''}. Receipt {shortSignature(result.signature)}.</span>
            <button type="button" className={styles.txLink} onClick={() => void openPumpfunSignature(result.signature!, cluster)}>
              {getSolscanTxLabel(cluster)}
            </button>
          </div>
        )}
        {result?.error && <div className={`${styles.result} ${styles.resultErr}`}>{result.error}</div>}
      </div>

      {live.length > 0 && (
        <div className={styles.psec}>
          <span className="label">Live · {live.length}</span>
          <div className={styles.livecard}>
            {live.map((t) => (
              <div key={t.id} className={styles.drow}>
                <span className={`dot${t.status === 'confirmed' ? ' live' : t.status === 'failed' ? ' err' : ' warn'}`} />
                <span className={styles.drowNm}>${t.symbol}</span>
                <span className={`${styles.drowStatus} mono`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
