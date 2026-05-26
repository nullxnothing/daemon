import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  Copy,
  DownloadSimple,
  Key,
  Lightning,
  Plug,
  Receipt,
  Trash,
  Wallet,
} from '@phosphor-icons/react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import './MeterflowPanel.css'

type MeterflowTab = 'receipts' | 'meters' | 'budgets' | 'webhooks'
type Tone = 'good' | 'warn' | 'bad' | 'neutral'

const TABS: Array<{ id: MeterflowTab; label: string }> = [
  { id: 'receipts', label: 'Receipts' },
  { id: 'meters', label: 'Meters' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'webhooks', label: 'Webhooks' },
]

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/^\$/, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function money(value: unknown): string {
  return asNumber(value).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 3,
  })
}

function shortId(value?: string | null, left = 5, right = 4): string {
  if (!value) return '--'
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}...${value.slice(-right)}`
}

function timeLabel(value?: string | number | null): string {
  if (!value) return '--'
  const time = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(time)) return '--'
  return new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function receiptAmount(receipt: MeterflowReceipt): number {
  return asNumber(receipt.amountUsd ?? receipt.amountUSDC ?? receipt.amount_usd)
}

function balanceLabel(value?: number | null, symbol = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const amount = value.toLocaleString(undefined, { maximumFractionDigits: symbol === 'SOL' ? 6 : 3 })
  return symbol ? `${amount} ${symbol}` : amount
}

function receiptState(receipt: MeterflowReceipt): { label: string; detail: string; tone: Tone } {
  const raw = String(receipt.paymentState ?? receipt.status ?? 'unknown').toLowerCase()
  if (raw.includes('failed') || raw.includes('error') || raw.includes('rejected')) {
    return { label: raw.replace(/_/g, ' '), detail: receipt.error ?? 'Needs review', tone: 'bad' }
  }
  if (raw.includes('unsettled') || raw.includes('pending') || raw.includes('quote')) {
    return { label: raw.replace(/_/g, ' '), detail: receipt.error ?? 'Payment flow not complete', tone: 'warn' }
  }
  if (raw.includes('settled') || raw.includes('verified') || raw.includes('success') || raw.includes('paid')) {
    return { label: raw.replace(/_/g, ' '), detail: 'Verified receipt', tone: 'good' }
  }
  return { label: raw.replace(/_/g, ' '), detail: receipt.error ?? 'Recorded', tone: 'neutral' }
}

function isSettled(receipt: MeterflowReceipt): boolean {
  return receiptState(receipt).tone === 'good'
}

function isReview(receipt: MeterflowReceipt): boolean {
  const tone = receiptState(receipt).tone
  return tone === 'bad' || tone === 'warn'
}

function routeLabel(receipt: MeterflowReceipt): string {
  return String(receipt.route ?? receipt.meterId ?? receipt.path ?? '--')
}

function verifyUrl(receipt: MeterflowReceipt): string | null {
  return String(receipt.publicVerifyUrl ?? receipt.receiptUrl ?? receipt.verifyUrl ?? '') || null
}

function meterPrice(meter: MeterflowMeter): string {
  const asset = meter.asset ?? 'USDC'
  return `${money(meter.priceUsd ?? meter.price_usd)} ${asset}`
}

function downloadCsv(exported: MeterflowCsvExport) {
  const blob = new Blob([exported.content], { type: exported.contentType || 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exported.filename
  link.click()
  URL.revokeObjectURL(url)
}

export function MeterflowPanel() {
  const activeProjectPath = useUIStore((state) => state.activeProjectPath)
  const [status, setStatus] = useState<MeterflowStatus | null>(null)
  const [overview, setOverview] = useState<MeterflowOverview | null>(null)
  const [demoWallet, setDemoWallet] = useState<MeterflowDemoWallet | null>(null)
  const [readiness, setReadiness] = useState<MeterflowWalletReadiness | null>(null)
  const [activeTab, setActiveTab] = useState<MeterflowTab>('receipts')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [walletBusy, setWalletBusy] = useState(false)
  const [paymentRunning, setPaymentRunning] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<MeterflowReceiptDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const refreshDemoWallet = useCallback(async () => {
    const [walletRes, readinessRes] = await Promise.all([
      daemon.meterflow.getDemoWallet(),
      daemon.meterflow.checkDemoWalletReadiness(),
    ])
    if (walletRes.ok) setDemoWallet(walletRes.data ?? null)
    if (readinessRes.ok && readinessRes.data) setReadiness(readinessRes.data)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    if (!silent) setError(null)

    const statusRes = await daemon.meterflow.status()
    if (!statusRes.ok || !statusRes.data) {
      setError(statusRes.error ?? 'Meterflow status failed')
      setLoading(false)
      setRefreshing(false)
      return
    }

    setStatus(statusRes.data)

    const overviewRes = await daemon.meterflow.overview()
    if (overviewRes.ok && overviewRes.data) {
      setOverview(overviewRes.data)
      setStatus(overviewRes.data.status)
    } else {
      setError(overviewRes.error ?? 'Meterflow overview failed')
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load()
    void refreshDemoWallet()
  }, [load, refreshDemoWallet])

  useEffect(() => {
    if (!activeProjectPath) return undefined
    let disposed = false
    daemon.meterflow.watchProject(activeProjectPath).then((res) => {
      if (!disposed && !res.ok) setError(res.error ?? 'Meterflow receipt watcher failed')
    })
    return () => { disposed = true }
  }, [activeProjectPath])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void load(true)
      void refreshDemoWallet()
    }, 2_500)
    return () => window.clearInterval(interval)
  }, [load, refreshDemoWallet])

  const metrics = useMemo(() => {
    const receipts = overview?.receipts ?? []
    const settled = receipts.filter(isSettled)
    const review = receipts.filter(isReview)
    const gross = settled.reduce((sum, receipt) => sum + receiptAmount(receipt), 0)
    return { receipts, settled: settled.length, review: review.length, gross }
  }, [overview])

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    setError(null)
    const res = await daemon.meterflow.storeApiKey(apiKey.trim())
    setSavingKey(false)
    if (!res.ok) {
      setError(res.error ?? 'Failed to save key')
      return
    }
    setApiKey('')
    setActionMessage('Meterflow key saved')
    void load()
  }

  const handleDeleteKey = async () => {
    setError(null)
    const res = await daemon.meterflow.deleteApiKey()
    if (!res.ok) {
      setError(res.error ?? 'Failed to delete key')
      return
    }
    setOverview(null)
    setStatus({ configured: false, keySource: 'none', baseUrl: 'https://www.meterflow.fun/proxy', tier: null, balanceUsd: null, executionReady: true, error: null, raw: null })
    setActionMessage('Meterflow key removed')
  }

  const handleExport = async () => {
    setError(null)
    const res = await daemon.meterflow.exportReceiptsCsv()
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Receipt export failed')
      return
    }
    downloadCsv(res.data)
  }

  const handleOpenReceipt = async (receipt: MeterflowReceipt) => {
    setDetailLoading(true)
    setSelectedReceipt(null)
    const detail = await daemon.meterflow.getReceipt(receipt.id)
    if (detail.ok && detail.data) {
      let graph = detail.data.graph
      if (!graph) {
        const graphRes = await daemon.meterflow.getReceiptGraph(receipt.id)
        graph = graphRes.ok && graphRes.data ? graphRes.data : null
      }
      setSelectedReceipt({ receipt: detail.data.receipt, graph })
    } else {
      setError(detail.error ?? 'Receipt detail failed')
    }
    setDetailLoading(false)
  }

  const handleCopy = async (value?: string | null, label = 'Value') => {
    if (!value) return
    const res = await daemon.env.copyValue(value)
    if (res.ok) setActionMessage(`${label} copied`)
    else setError(res.error ?? `Failed to copy ${label.toLowerCase()}`)
  }

  const handleCreateDemoWallet = async () => {
    setWalletBusy(true)
    setError(null)
    const res = await daemon.meterflow.createDemoWallet()
    setWalletBusy(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Demo wallet creation failed')
      return
    }
    setDemoWallet(res.data)
    setActionMessage('Meterflow demo wallet ready')
    void refreshDemoWallet()
  }

  const handlePaidTest = async () => {
    setPaymentRunning(true)
    setActionMessage(null)
    setError(null)
    const res = await daemon.meterflow.callPaidAgentReadiness({ agentName: 'DAEMON Meterflow Demo' })
    setPaymentRunning(false)
    void refreshDemoWallet()
    if (!res.ok || !res.data) {
      const message = res.error ?? 'x402 payment failed'
      const fundingMessage = readiness?.fundingMessage ?? ''
      setError(message.includes(fundingMessage) ? message : `${message} ${fundingMessage}`.trim())
      return
    }
    setActionMessage(`Meterflow receipt recorded: ${shortId(res.data.receipt.id, 8, 5)}`)
    setSelectedReceipt({ receipt: res.data.receipt, graph: res.data.result as MeterflowReceiptGraph })
    await load(true)
  }

  const handleTestMeter = async (meterId: string) => {
    setActionMessage(null)
    setError(null)
    if (meterId) void handlePaidTest()
  }

  if (loading && !status) {
    return (
      <div className="meterflow-panel">
        <div className="meterflow-loading">Loading Meterflow...</div>
      </div>
    )
  }

  return (
    <div className={`meterflow-panel${isMinimized ? ' is-minimized' : ''}`}>
      <div className="meterflow-toolbar">
        <div className="meterflow-brand">
          <img className="meterflow-logo" src="./meterflow-mark.svg" alt="" />
          <div>
            <div className="meterflow-kicker">Meterflow</div>
            <div className="meterflow-title">Ops Ledger</div>
          </div>
        </div>
        <div className="meterflow-actions">
          <button type="button" className="meterflow-icon-button" onClick={() => setIsMinimized((value) => !value)} title={isMinimized ? 'Expand' : 'Minimize'} aria-label={isMinimized ? 'Expand Meterflow panel' : 'Minimize Meterflow panel'}>
            {isMinimized ? <CaretDown size={15} weight="bold" /> : <CaretUp size={15} weight="bold" />}
          </button>
          <button type="button" className="meterflow-icon-button" onClick={() => void load(true)} title="Refresh" aria-label="Refresh Meterflow">
            <ArrowClockwise size={15} weight={refreshing ? 'fill' : 'bold'} />
          </button>
          {status?.configured && (
            <button type="button" className="meterflow-icon-button" onClick={() => void handleDeleteKey()} title="Delete key" aria-label="Delete Meterflow key">
              <Trash size={15} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {isMinimized ? null : (
        <>
      <div className={`meterflow-status ${status?.executionReady ? 'live' : 'error'}`}>
        <span />
        <strong>{status?.configured ? 'Connected' : 'Local ledger'}</strong>
        <em>{status?.tier ?? status?.keySource ?? 'secure'}</em>
      </div>

      {error && <div className="meterflow-error">{error}</div>}
      {status?.error && <div className="meterflow-error">{status.error}</div>}
      {overview?.errors.length ? <div className="meterflow-warning">{overview.errors.length} optional feed issue{overview.errors.length === 1 ? '' : 's'}</div> : null}
      {actionMessage && <div className="meterflow-notice">{actionMessage}</div>}

      {!status?.configured && (
        <section className="meterflow-inline-key">
          <input
            className="meterflow-input"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveKey() }}
            type="password"
            placeholder="Optional Meterflow API key"
            aria-label="Meterflow API key"
          />
          <button type="button" className="meterflow-button" onClick={() => void handleSaveKey()} disabled={savingKey || !apiKey.trim()}>
            <Key size={14} weight="bold" />
            {savingKey ? 'Saving' : 'Save Key'}
          </button>
        </section>
      )}

      <DemoWalletPanel
        wallet={demoWallet}
        readiness={readiness}
        walletBusy={walletBusy}
        paymentRunning={paymentRunning}
        onCreateWallet={handleCreateDemoWallet}
        onCopy={handleCopy}
        onPaidTest={handlePaidTest}
      />

      <div className="meterflow-metrics">
        <Metric label="Recorded" value={metrics.receipts.length.toLocaleString()} />
        <Metric label="Settled" value={metrics.settled.toLocaleString()} tone="good" />
        <Metric label="Review" value={metrics.review.toLocaleString()} tone={metrics.review ? 'warn' : 'neutral'} />
        <Metric label="Gross" value={money(metrics.gross)} tone="good" />
      </div>

      <div className="meterflow-tabs" role="tablist" aria-label="Meterflow sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="meterflow-scroll">
        {activeTab === 'receipts' && (
          <ReceiptsView
            receipts={overview?.receipts ?? []}
            selectedReceipt={selectedReceipt}
            detailLoading={detailLoading}
            onOpenReceipt={handleOpenReceipt}
            onCloseReceipt={() => setSelectedReceipt(null)}
            onCopy={handleCopy}
            onExport={handleExport}
          />
        )}
        {activeTab === 'meters' && (
          <MetersView
            meters={overview?.meters ?? []}
            revenue={overview?.revenue ?? []}
            onTestMeter={handleTestMeter}
          />
        )}
        {activeTab === 'budgets' && (
          <BudgetsView
            budgets={overview?.budgets ?? []}
            sessions={overview?.agentSessions ?? []}
          />
        )}
        {activeTab === 'webhooks' && <WebhooksView webhooks={overview?.webhooks ?? []} />}
      </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div className={`meterflow-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="meterflow-empty">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}

function DemoWalletPanel({
  wallet,
  readiness,
  walletBusy,
  paymentRunning,
  onCreateWallet,
  onCopy,
  onPaidTest,
}: {
  wallet: MeterflowDemoWallet | null
  readiness: MeterflowWalletReadiness | null
  walletBusy: boolean
  paymentRunning: boolean
  onCreateWallet: () => void
  onCopy: (value?: string | null, label?: string) => void
  onPaidTest: () => void
}) {
  const blockers = readiness?.blockers ?? []
  return (
    <section className="meterflow-demo">
      <div className="meterflow-demo-head">
        <div className="meterflow-setup-icon"><Wallet size={18} weight="duotone" /></div>
        <div>
          <h3>Demo Payer</h3>
          <span>{readiness?.network ?? 'Solana'} x402 test wallet</span>
        </div>
      </div>

      {wallet ? (
        <>
          <div className="meterflow-wallet-row">
            <code>{wallet.address}</code>
            <button type="button" className="meterflow-icon-button" onClick={() => onCopy(wallet.address, 'Payer address')} aria-label="Copy payer wallet address" title="Copy payer wallet address">
              <Copy size={14} weight="bold" />
            </button>
          </div>
          <div className="meterflow-balance-grid">
            <div><span>SOL</span><strong>{balanceLabel(readiness?.solBalance, 'SOL')}</strong></div>
            <div><span>USDC</span><strong>{balanceLabel(readiness?.usdcBalance, 'USDC')}</strong></div>
          </div>
          {blockers.length > 0 && <div className="meterflow-warning compact">{readiness?.fundingMessage}</div>}
        </>
      ) : (
        <div className="meterflow-warning compact">Create a dedicated low-balance wallet for Meterflow payment testing.</div>
      )}

      <div className="meterflow-demo-actions">
        <button type="button" className="meterflow-button" onClick={onCreateWallet} disabled={walletBusy}>
          <Wallet size={14} weight="bold" />
          {walletBusy ? 'Creating' : wallet ? 'Wallet Ready' : 'Create Demo Wallet'}
        </button>
        <button type="button" className="meterflow-button primary" onClick={onPaidTest} disabled={!wallet || paymentRunning}>
          <Lightning size={14} weight="bold" />
          {paymentRunning ? 'Paying' : 'Test x402'}
        </button>
      </div>
    </section>
  )
}

function ReceiptsView({
  receipts,
  selectedReceipt,
  detailLoading,
  onOpenReceipt,
  onCloseReceipt,
  onCopy,
  onExport,
}: {
  receipts: MeterflowReceipt[]
  selectedReceipt: MeterflowReceiptDetail | null
  detailLoading: boolean
  onOpenReceipt: (receipt: MeterflowReceipt) => void
  onCloseReceipt: () => void
  onCopy: (value?: string | null, label?: string) => void
  onExport: () => void
}) {
  return (
    <section className="meterflow-section">
      <div className="meterflow-section-head">
        <div>
          <h3>Payment Ledger</h3>
          <span>{receipts.length.toLocaleString()} latest receipts</span>
        </div>
        <button type="button" className="meterflow-button" onClick={onExport}>
          <DownloadSimple size={14} weight="bold" />
          CSV
        </button>
      </div>

      {receipts.length === 0 ? (
        <EmptyState
          icon={<Receipt size={24} weight="duotone" />}
          title="No receipts"
          body="Live Meterflow receipts appear after metered requests settle."
        />
      ) : (
        <div className="meterflow-receipt-feed">
          {receipts.map((receipt) => {
            const state = receiptState(receipt)
            const tx = receipt.txSignature ?? receipt.signature as string | undefined
            const publicUrl = verifyUrl(receipt)
            return (
              <article key={receipt.id} className="meterflow-receipt-row">
                <div className="meterflow-row-top">
                  <span className={`meterflow-badge ${state.tone}`}>{state.label}</span>
                  <strong>{money(receiptAmount(receipt))}</strong>
                </div>
                <div className="meterflow-route">{routeLabel(receipt)}</div>
                <div className="meterflow-row-grid">
                  <div><span>Time</span><strong>{timeLabel(receipt.createdAt)}</strong></div>
                  <div><span>Payer</span><strong>{shortId(receipt.payerWallet ?? receipt.wallet)}</strong></div>
                  <div><span>Tx</span><strong>{shortId(tx)}</strong></div>
                  <div><span>HTTP</span><strong>{receipt.responseStatus ?? '--'}</strong></div>
                </div>
                <div className="meterflow-row-actions">
                  <button
                    type="button"
                    className="meterflow-icon-button"
                    title="Copy receipt ID"
                    aria-label="Copy receipt ID"
                    onClick={() => onCopy(receipt.id, 'Receipt ID')}
                  >
                    <Copy size={14} weight="bold" />
                  </button>
                  {publicUrl && (
                    <button
                      type="button"
                      className="meterflow-icon-button"
                      title="Open verify URL"
                      aria-label="Open verify URL"
                      onClick={() => void daemon.shell.openExternal(publicUrl)}
                    >
                      <ArrowSquareOut size={14} weight="bold" />
                    </button>
                  )}
                  {tx && (
                    <button
                      type="button"
                      className="meterflow-icon-button"
                      title="Open transaction"
                      aria-label="Open transaction"
                      onClick={() => void daemon.shell.openExternal(`https://solscan.io/tx/${tx}`)}
                    >
                      <ArrowSquareOut size={14} weight="bold" />
                    </button>
                  )}
                  <button type="button" className="meterflow-button" onClick={() => onOpenReceipt(receipt)}>
                    View
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {detailLoading && <div className="meterflow-loading slim">Loading receipt...</div>}
      {selectedReceipt && (
        <ReceiptDetail detail={selectedReceipt} onClose={onCloseReceipt} onCopy={onCopy} />
      )}
    </section>
  )
}

function ReceiptDetail({ detail, onClose, onCopy }: { detail: MeterflowReceiptDetail; onClose: () => void; onCopy: (value?: string | null, label?: string) => void }) {
  const receipt = detail.receipt
  const state = receiptState(receipt)
  const tx = receipt.txSignature ?? receipt.signature as string | undefined
  const publicUrl = verifyUrl(receipt)
  return (
    <section className="meterflow-detail">
      <div className="meterflow-detail-head">
        <div>
          <span className={`meterflow-badge ${state.tone}`}>{state.label}</span>
          <h3>{shortId(receipt.id, 10, 6)}</h3>
        </div>
        <div className="meterflow-detail-actions">
          <button type="button" className="meterflow-icon-button" onClick={() => onCopy(receipt.id, 'Receipt ID')} aria-label="Copy receipt ID" title="Copy receipt ID">
            <Copy size={14} weight="bold" />
          </button>
          {tx && (
            <button type="button" className="meterflow-icon-button" onClick={() => onCopy(tx, 'Transaction signature')} aria-label="Copy transaction signature" title="Copy transaction signature">
              <Copy size={14} weight="bold" />
            </button>
          )}
          {publicUrl && (
            <button type="button" className="meterflow-icon-button" onClick={() => void daemon.shell.openExternal(publicUrl)} aria-label="Open verify URL" title="Open verify URL">
              <ArrowSquareOut size={14} weight="bold" />
            </button>
          )}
          <button type="button" className="meterflow-icon-button" onClick={onClose} aria-label="Close receipt detail">x</button>
        </div>
      </div>
      <dl className="meterflow-detail-grid">
        <div><dt>Route</dt><dd>{routeLabel(receipt)}</dd></div>
        <div><dt>Amount</dt><dd>{money(receiptAmount(receipt))} {receipt.asset ?? 'USDC'}</dd></div>
        <div><dt>Payer</dt><dd>{shortId(receipt.payerWallet ?? receipt.wallet, 8, 6)}</dd></div>
        <div><dt>Tx</dt><dd>{shortId(tx, 8, 6)}</dd></div>
      </dl>
      <pre>{JSON.stringify(detail.graph ?? detail.receipt, null, 2)}</pre>
    </section>
  )
}

function MetersView({
  meters,
  revenue,
  onTestMeter,
}: {
  meters: MeterflowMeter[]
  revenue: MeterflowRevenueRow[]
  onTestMeter: (meterId: string) => void
}) {
  const revenueByMeter = useMemo(() => {
    const map = new Map<string, MeterflowRevenueRow>()
    for (const row of revenue) {
      if (row.meterId) map.set(String(row.meterId), row)
    }
    return map
  }, [revenue])

  return (
    <section className="meterflow-section">
      <div className="meterflow-section-head">
        <div>
          <h3>Endpoint Catalog</h3>
          <span>{meters.length.toLocaleString()} configured meters</span>
        </div>
      </div>
      {meters.length === 0 ? (
        <EmptyState icon={<Plug size={24} weight="duotone" />} title="No meters" body="Configured Meterflow routes will appear here." />
      ) : (
        <div className="meterflow-card-list">
          {meters.map((meter) => {
            const revenueRow = revenueByMeter.get(meter.id)
            const gateway = String(meter.endpoint ?? meter.targetUrl ?? '')
            return (
              <article key={meter.id} className="meterflow-card">
                <div className="meterflow-row-top">
                  <span className="meterflow-badge neutral">{(meter.status ?? 'unknown').toUpperCase()}</span>
                  <strong>{meterPrice(meter)}</strong>
                </div>
                <div className="meterflow-route">{meter.route ?? meter.endpoint ?? meter.id}</div>
                {meter.description && <p>{meter.description}</p>}
                <div className="meterflow-row-grid">
                  <div><span>Method</span><strong>{meter.method ?? 'POST'}</strong></div>
                  <div><span>Unit</span><strong>{meter.unit ?? 'request'}</strong></div>
                  <div><span>Calls</span><strong>{asNumber(revenueRow?.calls).toLocaleString()}</strong></div>
                  <div><span>Gross</span><strong>{money(revenueRow?.grossUsd ?? revenueRow?.estimatedUsd)}</strong></div>
                </div>
                <div className="meterflow-row-actions">
                  {gateway.startsWith('http') && (
                    <button
                      type="button"
                      className="meterflow-icon-button"
                      title="Open gateway"
                      aria-label="Open gateway"
                      onClick={() => void daemon.shell.openExternal(gateway)}
                    >
                      <ArrowSquareOut size={14} weight="bold" />
                    </button>
                  )}
                  <button type="button" className="meterflow-button" onClick={() => onTestMeter(meter.id)}>
                    Test Quote
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function BudgetsView({ budgets, sessions }: { budgets: MeterflowBudget[]; sessions: MeterflowAgentSession[] }) {
  return (
    <section className="meterflow-section">
      <div className="meterflow-section-head">
        <div>
          <h3>Agent Spend Controls</h3>
          <span>{budgets.length} budgets · {sessions.length} sessions</span>
        </div>
      </div>

      <h4 className="meterflow-subhead">Budgets</h4>
      {budgets.length === 0 ? (
        <EmptyState icon={<Key size={24} weight="duotone" />} title="No budgets" body="Budget policies created in Meterflow appear here." />
      ) : (
        <div className="meterflow-card-list">
          {budgets.map((budget) => (
            <article key={budget.id} className="meterflow-card">
              <div className="meterflow-row-top">
                <span className={`meterflow-badge ${budget.status === 'active' ? 'good' : 'neutral'}`}>{budget.status ?? 'unknown'}</span>
                <strong>{money(budget.spentUsdToday)} spent</strong>
              </div>
              <div className="meterflow-route">{budget.name ?? budget.id}</div>
              <div className="meterflow-row-grid">
                <div><span>Daily</span><strong>{money(budget.dailyCapUsd)}</strong></div>
                <div><span>Per Call</span><strong>{money(budget.perCallCapUsd)}</strong></div>
              </div>
            </article>
          ))}
        </div>
      )}

      <h4 className="meterflow-subhead">Sessions</h4>
      {sessions.length === 0 ? (
        <EmptyState icon={<Key size={24} weight="duotone" />} title="No sessions" body="Short-lived agent spend sessions appear here." />
      ) : (
        <div className="meterflow-card-list">
          {sessions.map((session) => (
            <article key={session.id} className="meterflow-card">
              <div className="meterflow-row-top">
                <span className={`meterflow-badge ${session.status === 'active' ? 'good' : 'neutral'}`}>{session.status ?? 'unknown'}</span>
                <strong>{money(session.spentUsd)} spent</strong>
              </div>
              <div className="meterflow-route">{session.name ?? session.id}</div>
              <div className="meterflow-row-grid">
                <div><span>Agent</span><strong>{shortId(session.agentId, 7, 4)}</strong></div>
                <div><span>Max</span><strong>{money(session.maxSpendUsd)}</strong></div>
                <div><span>Per Call</span><strong>{money(session.perCallCapUsd)}</strong></div>
                <div><span>Expires</span><strong>{timeLabel(session.expiresAt)}</strong></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function WebhooksView({ webhooks }: { webhooks: MeterflowWebhook[] }) {
  return (
    <section className="meterflow-section">
      <div className="meterflow-section-head">
        <div>
          <h3>Signed Webhooks</h3>
          <span>{webhooks.length.toLocaleString()} endpoints</span>
        </div>
      </div>
      {webhooks.length === 0 ? (
        <EmptyState icon={<Plug size={24} weight="duotone" />} title="No webhooks" body="Signed Meterflow webhook endpoints appear here." />
      ) : (
        <div className="meterflow-card-list">
          {webhooks.map((webhook) => (
            <article key={webhook.id} className="meterflow-card">
              <div className="meterflow-row-top">
                <span className={`meterflow-badge ${webhook.status === 'active' ? 'good' : 'neutral'}`}>{webhook.status ?? 'unknown'}</span>
                <strong>{webhook.lastStatus ?? '--'}</strong>
              </div>
              <div className="meterflow-route">{webhook.url ?? webhook.id}</div>
              <div className="meterflow-tags">
                {(webhook.events ?? []).slice(0, 5).map((eventName) => <span key={eventName}>{eventName}</span>)}
              </div>
              <div className="meterflow-row-grid">
                <div><span>Last</span><strong>{timeLabel(webhook.lastDeliveryAt)}</strong></div>
                <div><span>Secret</span><strong>{webhook.secretHint ?? '--'}</strong></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
