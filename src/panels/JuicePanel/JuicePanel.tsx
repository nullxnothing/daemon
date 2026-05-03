import { useEffect, useMemo, useState } from 'react'
import type { EngineAction, EngineResult, IpcResponse } from '../../../electron/shared/types'
import { daemon } from '../../lib/daemonBridge'
import './JuicePanel.css'

type JuiceWallet = {
  id: string
  publicKey: string
  mint: string | null
  symbol?: string | null
  name?: string | null
  isActive: boolean
  deactivationReason?: string | null
  stopLossPrice?: number | null
  takeProfitPrice?: number | null
}

type JuiceWalletBalances = {
  mmTokenId: string
  publicKey: string
  mint: string | null
  solBalance: number
  tokenBalances: Array<{ mint: string; balance: number; decimals: number }>
}

type JuiceWalletPnl = {
  mmTokenId: string
  mint: string
  symbol?: string
  walletAddress: string
  pnl: {
    totalUsd: number
    totalPercent: number
    realizedUsd: number
    realizedPercent: number
    unrealizedUsd: number
    unrealizedPercent: number
  }
}

type JuiceScoutToken = {
  mint: string
  symbol: string
  name: string
  price: number
  marketCap: number
  liquidity: number
  score: number
  maxScore: number
  grade: string
  priceChange1hPercent?: number
  priceChange24hPercent?: number
  volume1hUsd?: number
  volume24hUsd?: number
}

type JuiceScoutingReport = {
  tokens: JuiceScoutToken[]
  tokenCount: number
  scannedAt: string
}

type JuiceActionType = Extract<EngineAction['type'], `juice:${string}`>

type WalletRow = {
  wallet: JuiceWallet
  balances: JuiceWalletBalances | null
  pnl: JuiceWalletPnl | null
  error: string | null
}

function formatUsd(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function formatNumber(value?: number | null, max = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: max })
}

function shortAddress(value?: string | null) {
  if (!value) return '—'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

async function runJuiceAction<T>(type: JuiceActionType, payload?: Record<string, unknown>): Promise<IpcResponse<T>> {
  const action: EngineAction = { type, payload }
  const response = await daemon.engine.run(action) as IpcResponse<EngineResult<T>>
  if (!response.ok) return { ok: false, error: response.error }

  const result = response.data
  if (!result?.ok) return { ok: false, error: result?.error ?? `Juice action failed: ${type}` }

  return { ok: true, data: result.data as T }
}

export function JuicePanel() {
  const [hasKey, setHasKey] = useState(false)
  const [checkingKey, setCheckingKey] = useState(true)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [keySaving, setKeySaving] = useState(false)
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [walletRows, setWalletRows] = useState<WalletRow[]>([])
  const [scoutingReport, setScoutingReport] = useState<JuiceScoutingReport | null>(null)

  const totals = useMemo(() => {
    const activeWallets = walletRows.filter((row) => row.wallet.isActive).length
    const idleWallets = walletRows.length - activeWallets
    const totalSol = walletRows.reduce((sum, row) => sum + (row.balances?.solBalance ?? 0), 0)
    const totalPnlUsd = walletRows.reduce((sum, row) => sum + (row.pnl?.pnl.totalUsd ?? 0), 0)
    return { activeWallets, idleWallets, totalSol, totalPnlUsd }
  }, [walletRows])

  const refreshKeyStatus = async () => {
    setCheckingKey(true)
    const keys = await daemon.claude.listKeys().catch(() => null)
    const keyFromSecureStore = Boolean(keys?.ok && keys.data?.some((entry) => entry.key_name === 'JUICE_API_KEY'))
    const engineKey = await runJuiceAction<boolean>('juice:has-key').catch(() => null)
    const ready = keyFromSecureStore || Boolean(engineKey?.ok && engineKey.data)
    setHasKey(ready)
    setCheckingKey(false)
    return ready
  }

  useEffect(() => {
    let cancelled = false
    async function checkKey() {
      const ready = await refreshKeyStatus().catch(() => false)
      if (!cancelled) setHasKey(ready)
    }
    void checkKey()
    return () => { cancelled = true }
  }, [])

  const saveKey = async () => {
    const trimmed = apiKeyDraft.trim()
    if (!trimmed) {
      setKeyMessage('Paste a Juice API key first.')
      return
    }

    setKeySaving(true)
    setKeyMessage(null)
    setError(null)
    try {
      const res = await runJuiceAction<boolean>('juice:store-key', { apiKey: trimmed })
      if (!res.ok) throw new Error(res.error)
      setApiKeyDraft('')
      setKeyMessage('Juice API key saved securely.')
      await refreshKeyStatus()
    } catch (err) {
      setKeyMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setKeySaving(false)
    }
  }

  const deleteKey = async () => {
    setKeySaving(true)
    setKeyMessage(null)
    setError(null)
    try {
      const res = await runJuiceAction<boolean>('juice:delete-key')
      if (!res.ok) throw new Error(res.error)
      setWalletRows([])
      setScoutingReport(null)
      setKeyMessage('Juice API key removed.')
      await refreshKeyStatus()
    } catch (err) {
      setKeyMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setKeySaving(false)
    }
  }

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const walletsRes = await runJuiceAction<JuiceWallet[]>('juice:list-wallets')
      if (!walletsRes.ok || !walletsRes.data) throw new Error(walletsRes.error ?? 'Could not load Juice wallets')

      const rows = await Promise.all(walletsRes.data.map(async (wallet): Promise<WalletRow> => {
        const [balancesRes, pnlRes] = await Promise.all([
          runJuiceAction<JuiceWalletBalances>('juice:get-balances', { walletId: wallet.id }).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) } as IpcResponse<JuiceWalletBalances>)),
          runJuiceAction<JuiceWalletPnl>('juice:get-pnl', { walletId: wallet.id }).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) } as IpcResponse<JuiceWalletPnl>)),
        ])
        return {
          wallet,
          balances: balancesRes.ok ? balancesRes.data ?? null : null,
          pnl: pnlRes.ok ? pnlRes.data ?? null : null,
          error: !balancesRes.ok || !pnlRes.ok ? [balancesRes.error, pnlRes.error].filter(Boolean).join(' / ') : null,
        }
      }))

      const scoutRes = await runJuiceAction<JuiceScoutingReport>('juice:get-scouting-report').catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) } as IpcResponse<JuiceScoutingReport>))
      setWalletRows(rows)
      setScoutingReport(scoutRes.ok ? scoutRes.data ?? null : null)
      if (!scoutRes.ok && rows.length === 0) setError(scoutRes.error ?? 'Juice scouting report is unavailable')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="juice-panel">
      <header className="juice-hero">
        <div>
          <div className="juice-eyebrow">Juice Market Maker</div>
          <h2>MM wallet cockpit</h2>
          <p>Read-only view for Juice wallets, balances, PNL, and scouting reports before DAEMON enables guarded execution.</p>
        </div>
        <div className={`juice-key-pill ${hasKey ? 'ready' : 'missing'}`}>
          {checkingKey ? 'Checking key…' : hasKey ? 'JUICE_API_KEY ready' : 'JUICE_API_KEY missing'}
        </div>
      </header>

      <section className="juice-key-card">
        <div>
          <h3>API key</h3>
          <p>Paste your Juice key once. DAEMON validates it with a read-only wallet call and stores it through the secure key service.</p>
        </div>
        <div className="juice-key-controls">
          <input
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste JUICE_API_KEY"
            disabled={keySaving}
          />
          <button className="juice-secondary-btn" onClick={saveKey} disabled={keySaving || !apiKeyDraft.trim()}>
            {keySaving ? 'Saving…' : 'Save key'}
          </button>
          <button className="juice-ghost-btn" onClick={deleteKey} disabled={keySaving || !hasKey}>
            Remove
          </button>
        </div>
        {keyMessage && <div className="juice-key-message">{keyMessage}</div>}
      </section>

      <div className="juice-actions">
        <button className="juice-primary-btn" onClick={loadDashboard} disabled={loading || !hasKey}>
          {loading ? 'Loading Juice…' : 'Load read-only dashboard'}
        </button>
        <span className="juice-action-note">Buy, sell, and wallet creation are intentionally not enabled in this panel yet.</span>
      </div>

      {error && (
        <div className="juice-warning">
          <strong>Juice data unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="juice-metrics-grid">
        <div className="juice-metric-card">
          <span>Total wallets</span>
          <strong>{walletRows.length}</strong>
        </div>
        <div className="juice-metric-card">
          <span>Active</span>
          <strong>{totals.activeWallets}</strong>
        </div>
        <div className="juice-metric-card">
          <span>Idle</span>
          <strong>{totals.idleWallets}</strong>
        </div>
        <div className="juice-metric-card">
          <span>Total SOL</span>
          <strong>{formatNumber(totals.totalSol, 3)}</strong>
        </div>
        <div className="juice-metric-card">
          <span>Total PNL</span>
          <strong>{formatUsd(totals.totalPnlUsd)}</strong>
        </div>
      </section>

      <section className="juice-section">
        <div className="juice-section-header">
          <h3>MM wallets</h3>
          <span>{walletRows.length ? `${walletRows.length} loaded` : 'No wallet data loaded'}</span>
        </div>
        <div className="juice-wallet-list">
          {walletRows.length === 0 ? (
            <div className="juice-empty">Add a Juice API key and load the dashboard to preview MM wallet state.</div>
          ) : walletRows.map((row) => (
            <article className="juice-wallet-card" key={row.wallet.id}>
              <div className="juice-wallet-topline">
                <div>
                  <strong>{row.wallet.symbol ?? row.wallet.name ?? shortAddress(row.wallet.mint)}</strong>
                  <span>{shortAddress(row.wallet.publicKey)}</span>
                </div>
                <span className={`juice-status ${row.wallet.isActive ? 'active' : 'idle'}`}>{row.wallet.isActive ? 'Active' : 'Idle'}</span>
              </div>
              <div className="juice-wallet-stats">
                <span>SOL <b>{formatNumber(row.balances?.solBalance, 3)}</b></span>
                <span>PNL <b>{formatUsd(row.pnl?.pnl.totalUsd)}</b></span>
                <span>SL <b>{formatNumber(row.wallet.stopLossPrice, 8)}</b></span>
                <span>TP <b>{formatNumber(row.wallet.takeProfitPrice, 8)}</b></span>
              </div>
              {row.error && <div className="juice-card-error">{row.error}</div>}
              {row.wallet.deactivationReason && <div className="juice-card-note">{row.wallet.deactivationReason}</div>}
            </article>
          ))}
        </div>
      </section>

      <section className="juice-section">
        <div className="juice-section-header">
          <h3>Scouting report</h3>
          <span>{scoutingReport ? `${scoutingReport.tokenCount} candidates` : 'No report loaded'}</span>
        </div>
        <div className="juice-scout-grid">
          {(scoutingReport?.tokens ?? []).slice(0, 8).map((token) => (
            <article className="juice-scout-card" key={token.mint}>
              <div className="juice-scout-topline">
                <div>
                  <strong>{token.symbol}</strong>
                  <span>{token.name}</span>
                </div>
                <b>{token.grade}</b>
              </div>
              <div className="juice-scout-score">{token.score}/{token.maxScore}</div>
              <div className="juice-scout-stats">
                <span>MC {formatUsd(token.marketCap)}</span>
                <span>Liq {formatUsd(token.liquidity)}</span>
                <span>1h {formatNumber(token.priceChange1hPercent, 2)}%</span>
                <span>24h {formatNumber(token.priceChange24hPercent, 2)}%</span>
              </div>
              <code>{shortAddress(token.mint)}</code>
            </article>
          ))}
          {!scoutingReport && <div className="juice-empty">Scouting reports will appear here after the read-only dashboard loads.</div>}
        </div>
      </section>
    </div>
  )
}

export default JuicePanel
