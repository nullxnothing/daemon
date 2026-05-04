import { useState, useEffect, useCallback, type RefObject } from 'react'
import { useWalletStore } from '../../store/wallet'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { formatCompactUsd } from '../../utils/format'
import { QuickView } from './QuickView'
import { TransactionPreviewCard } from '../../panels/WalletPanel/TransactionPreviewCard'
import { Stat } from '../Panel'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

type QuickViewMode = 'overview' | 'send' | 'swap' | 'receive'

interface WalletQuickViewProps {
  triggerRef: RefObject<HTMLElement | null>
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`
  if (amount >= 1) return amount.toFixed(2)
  return amount.toFixed(4)
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ─── Back Header ───

function SubviewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="qv-subview-header">
      <button className="qv-back-btn" onClick={onBack} aria-label="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="qv-subview-title">{title}</span>
    </div>
  )
}

// ─── Send Sub-View ───

function SendView({ walletId, holdings, onBack, executionLabel, signerLabel }: {
  walletId: string
  holdings: Array<{ mint: string; symbol: string; amount: number }>
  onBack: () => void
  executionLabel: string
  signerLabel: string
}) {
  const [selectedMint, setSelectedMint] = useState(SOL_MINT)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)
  const [pendingSend, setPendingSend] = useState<{
    recipient: string
    amount: number
    mode: 'sol' | 'token'
    mint: string
    sendMax: boolean
  } | null>(null)

  const selectedToken = holdings.find((h) => h.mint === selectedMint)
  const isSol = selectedMint === SOL_MINT

  const handleMax = () => {
    if (selectedToken) {
      setAmount(String(selectedToken.amount))
    }
  }

  useEffect(() => {
    let cancelled = false
    setPreview(null)

    if (!pendingSend) return

    void window.daemon.wallet.transactionPreview({
      kind: pendingSend.mode === 'sol' ? 'send-sol' : 'send-token',
      walletId,
      destination: pendingSend.recipient,
      amount: pendingSend.amount,
      sendMax: pendingSend.sendMax,
      mint: pendingSend.mint,
      tokenSymbol: selectedToken?.symbol,
    }).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setPreview(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [pendingSend, selectedToken?.symbol, walletId])

  const handleReviewSend = () => {
    setError(null)
    setResult(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!recipient.trim() || recipient.trim().length < 32) {
      setError('Enter a valid Solana address')
      return
    }

    setPendingSend({
      recipient: recipient.trim(),
      amount: parsedAmount,
      mode: isSol ? 'sol' : 'token',
      mint: selectedMint,
      sendMax: false,
    })
  }

  const handleSend = async () => {
    if (!pendingSend) return

    setLoading(true)
    try {
      const res = pendingSend.mode === 'sol'
        ? await window.daemon.wallet.sendSol({
          fromWalletId: walletId,
            toAddress: pendingSend.recipient,
            amountSol: pendingSend.amount,
          })
        : await window.daemon.wallet.sendToken({
            fromWalletId: walletId,
            toAddress: pendingSend.recipient,
            mint: pendingSend.mint,
            amount: pendingSend.amount,
          })

      if (res.ok && res.data) {
        setResult(res.data.signature)
        setAmount('')
        setRecipient('')
        setPendingSend(null)
      } else {
        setError(res.error ?? 'Send failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="qv-subview">
      <SubviewHeader title="Send" onBack={onBack} />
      <div className="qv-subview-body">
        <label className="qv-field-label">Token</label>
        <select
          className="qv-select"
          value={selectedMint}
          onChange={(e) => { setSelectedMint(e.target.value); setResult(null); setError(null) }}
        >
          {holdings.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} ({formatAmount(t.amount)})
            </option>
          ))}
        </select>

        <label className="qv-field-label">Amount</label>
        <div className="qv-input-row">
          <input
            className="qv-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            type="number"
            step="any"
            min="0"
          />
          <button className="qv-max-btn" onClick={handleMax}>MAX</button>
        </div>

        <label className="qv-field-label">Recipient</label>
        <input
          className="qv-input qv-input--address"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Solana address"
          spellCheck={false}
        />

        {!pendingSend ? (
          <button
            className="qv-primary-btn"
            disabled={loading}
            onClick={handleReviewSend}
          >
            Review Send
          </button>
        ) : (
          <>
            <TransactionPreviewCard
              title={preview?.title ?? 'Review Send'}
              backendLabel={preview?.backendLabel ?? executionLabel}
              signerLabel={preview?.signerLabel ?? signerLabel}
              destinationLabel={preview?.targetLabel ?? shortAddr(pendingSend.recipient)}
              amountLabel={preview?.amountLabel ?? `${pendingSend.amount} ${pendingSend.mode === 'sol' ? 'SOL' : selectedToken?.symbol ?? 'token'}`}
              feeLabel={preview?.feeLabel}
              warnings={preview?.warnings}
              notes={preview?.notes ?? [
                pendingSend.mode === 'token'
                  ? 'If the recipient does not have the token account yet, DAEMON will create it when needed.'
                  : 'This uses the same shared DAEMON transaction pipeline as the full wallet panel.',
              ]}
            />
            <button
              className="qv-primary-btn"
              disabled={loading}
              onClick={handleSend}
            >
              {loading ? 'Sending...' : 'Send Now'}
            </button>
            <button
              className="qv-secondary-btn"
              onClick={() => { setPendingSend(null); setError(null) }}
            >
              Cancel
            </button>
          </>
        )}

        {error && <div className="qv-feedback qv-feedback--error">{error}</div>}
        {result && (
          <div className="qv-feedback qv-feedback--success">
            Sent! Sig: {result.slice(0, 8)}...{result.slice(-8)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Swap Sub-View ───

interface SwapQuote {
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan: Array<{ label: string; percent: number }>
  rawQuoteResponse: unknown
}

function SwapView({ walletId, holdings, onBack, executionLabel, signerLabel }: {
  walletId: string
  holdings: Array<{ mint: string; symbol: string; amount: number }>
  onBack: () => void
  executionLabel: string
  signerLabel: string
}) {
  const [inputMint, setInputMint] = useState(SOL_MINT)
  const [outputMint, setOutputMint] = useState(USDC_MINT)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)

  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [swapLoading, setSwapLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)
  const [pendingSwap, setPendingSwap] = useState<{
    impactPct: number
    acknowledgedImpact: boolean
  } | null>(null)

  // Merge holdings with common tokens for output selector
  const allTokens = mergeWithCommon(holdings)
  const inputToken = allTokens.find((t) => t.mint === inputMint)
  const outputToken = allTokens.find((t) => t.mint === outputMint)

  const handleFlip = () => {
    setInputMint(outputMint)
    setOutputMint(inputMint)
    setQuote(null)
    setResult(null)
    setPendingSwap(null)
    setError(null)
  }

  const handleGetQuote = async () => {
    setError(null)
    setQuote(null)
    setResult(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (inputMint === outputMint) {
      setError('Tokens must differ')
      return
    }

    setQuoteLoading(true)
    try {
      const res = await window.daemon.wallet.swapQuote({
        inputMint,
        outputMint,
        amount: parsedAmount,
        slippageBps,
      })
      if (res.ok && res.data) {
        setQuote(res.data)
      } else {
        setError(res.error ?? 'Failed to get quote')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed')
    } finally {
      setQuoteLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setPreview(null)

    if (!quote || !pendingSwap) return

    void window.daemon.wallet.transactionPreview({
      kind: 'swap',
      walletId,
      inputMint,
      outputMint,
      inputSymbol: inputToken?.symbol,
      outputSymbol: outputToken?.symbol,
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      amount: parseFloat(amount),
      slippageBps,
      priceImpactPct: quote.priceImpactPct,
    }).then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setPreview(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [amount, inputMint, inputToken?.symbol, outputMint, outputToken?.symbol, pendingSwap, quote, slippageBps, walletId])

  const handleSwap = async () => {
    if (!quote) return
    const impactPct = parseFloat(quote.priceImpactPct)
    if (impactPct >= 5 && !pendingSwap?.acknowledgedImpact) {
      setError('Acknowledge the high price impact before executing this swap')
      return
    }
    setSwapLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await window.daemon.wallet.swapExecute({
        walletId,
        inputMint,
        outputMint,
        amount: parseFloat(amount),
        slippageBps,
        rawQuoteResponse: quote.rawQuoteResponse,
        // User clicked "Swap" which serves as the confirmation gesture here
        confirmedAt: Date.now(),
        acknowledgedImpact: impactPct < 5 || pendingSwap?.acknowledgedImpact === true,
      })
      if (res.ok && res.data) {
        setResult(res.data.signature)
        setQuote(null)
        setPendingSwap(null)
        setAmount('')
      } else {
        setError(res.error ?? 'Swap failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed')
    } finally {
      setSwapLoading(false)
    }
  }

  return (
    <div className="qv-subview">
      <SubviewHeader title="Swap" onBack={onBack} />
      <div className="qv-subview-body">
        <label className="qv-field-label">From</label>
        <select
          className="qv-select"
          value={inputMint}
          onChange={(e) => { setInputMint(e.target.value); setQuote(null) }}
        >
          {allTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} {t.balance !== undefined ? `(${formatAmount(t.balance)})` : ''}
            </option>
          ))}
        </select>

        <div className="qv-input-row">
          <input
            className="qv-input"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setQuote(null) }}
            placeholder="Amount"
            type="number"
            step="any"
            min="0"
          />
        </div>

        <div className="qv-flip-row">
          <button className="qv-flip-btn" onClick={handleFlip} title="Swap direction">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>

        <label className="qv-field-label">To</label>
        <select
          className="qv-select"
          value={outputMint}
          onChange={(e) => { setOutputMint(e.target.value); setQuote(null) }}
        >
          {allTokens.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} {t.balance !== undefined ? `(${formatAmount(t.balance)})` : ''}
            </option>
          ))}
        </select>

        <div className="qv-slippage-row">
          <span className="qv-slippage-label">Slippage: {(slippageBps / 100).toFixed(1)}%</span>
          <input
            className="qv-slippage-input"
            type="number"
            value={slippageBps}
            onChange={(e) => setSlippageBps(parseInt(e.target.value, 10) || 50)}
            min="1"
            max="5000"
          />
          <span className="qv-slippage-unit">bps</span>
        </div>

        {!quote && (
          <button
            className="qv-primary-btn"
            disabled={quoteLoading}
            onClick={handleGetQuote}
          >
            {quoteLoading ? 'Getting Quote...' : 'Get Quote'}
          </button>
        )}

        {quote && !pendingSwap && (
          <div className="qv-quote-box">
            <div className="qv-quote-rate">
              {formatAmount(parseFloat(quote.inAmount))} {inputToken?.symbol ?? '?'} -{'>'}{' '}
              {formatAmount(parseFloat(quote.outAmount))} {outputToken?.symbol ?? '?'}
            </div>
            <div className="qv-quote-impact">
              Impact: {parseFloat(quote.priceImpactPct).toFixed(3)}%
            </div>
            <button
              className="qv-primary-btn"
              disabled={swapLoading}
              onClick={() => setPendingSwap({ impactPct: parseFloat(quote.priceImpactPct), acknowledgedImpact: false })}
            >
              Review Swap
            </button>
            <button
              className="qv-secondary-btn"
              onClick={() => { setQuote(null); setError(null) }}
            >
              Cancel
            </button>
          </div>
        )}

        {quote && pendingSwap && (
          <div className="qv-quote-box">
            <TransactionPreviewCard
              title={preview?.title ?? 'Review Swap'}
              backendLabel={preview?.backendLabel ?? executionLabel}
              signerLabel={preview?.signerLabel ?? signerLabel}
              destinationLabel={preview?.targetLabel ?? `${inputToken?.symbol ?? '?'} -> ${outputToken?.symbol ?? '?'}`}
              amountLabel={preview?.amountLabel ?? `${formatAmount(parseFloat(quote.inAmount))} -> ${formatAmount(parseFloat(quote.outAmount))}`}
              feeLabel={preview?.feeLabel}
              warnings={preview?.warnings}
              notes={preview?.notes ?? [
                `Slippage: ${(slippageBps / 100).toFixed(2)}%`,
                `Price impact: ${pendingSwap.impactPct.toFixed(3)}%`,
                'This quote should be confirmed quickly to avoid stale pricing.',
              ]}
            />
            {pendingSwap.impactPct >= 5 && (
              <label className="qv-field-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={pendingSwap.acknowledgedImpact}
                  onChange={(e) => setPendingSwap((current) => current ? { ...current, acknowledgedImpact: e.target.checked } : current)}
                />
                {preview?.acknowledgementLabel ?? 'I understand this swap has very high price impact.'}
              </label>
            )}
            <button
              className="qv-primary-btn"
              disabled={swapLoading || (pendingSwap.impactPct >= 5 && !pendingSwap.acknowledgedImpact)}
              onClick={handleSwap}
            >
              {swapLoading ? 'Swapping...' : 'Execute Swap'}
            </button>
            <button
              className="qv-secondary-btn"
              onClick={() => { setPendingSwap(null); setError(null) }}
            >
              Cancel
            </button>
          </div>
        )}

        {error && <div className="qv-feedback qv-feedback--error">{error}</div>}
        {result && (
          <div className="qv-feedback qv-feedback--success">
            Swap confirmed! Sig: {result.slice(0, 8)}...{result.slice(-8)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Receive Sub-View ───

function ReceiveView({ address, onBack }: {
  address: string
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      const el = document.createElement('textarea')
      el.value = address
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  return (
    <div className="qv-subview">
      <SubviewHeader title="Receive" onBack={onBack} />
      <div className="qv-subview-body qv-receive-body">
        <div className="qv-receive-label">Your SOL address</div>
        <div className="qv-receive-address" title={address}>
          {address}
        </div>
        <button className="qv-primary-btn" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy Address'}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ───

interface TokenOption {
  mint: string
  symbol: string
  balance?: number
}

function mergeWithCommon(
  holdings: Array<{ mint: string; symbol: string; amount: number }>
): TokenOption[] {
  const seen = new Set<string>()
  const result: TokenOption[] = []

  for (const h of holdings) {
    if (!seen.has(h.mint)) {
      seen.add(h.mint)
      result.push({ mint: h.mint, symbol: h.symbol, balance: h.amount })
    }
  }

  const common = [
    { mint: SOL_MINT, symbol: 'SOL' },
    { mint: USDC_MINT, symbol: 'USDC' },
    { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT' },
  ]
  for (const c of common) {
    if (!seen.has(c.mint)) {
      seen.add(c.mint)
      result.push({ mint: c.mint, symbol: c.symbol })
    }
  }

  return result
}

// ─── Main Component ───

export function WalletQuickView({ triggerRef }: WalletQuickViewProps) {
  const isOpen = useUIStore((s) => s.walletQuickViewOpen)
  const closeAll = useUIStore((s) => s.closeAllQuickViews)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)
  const dashboard = useWalletStore((s) => s.dashboard)

  const [mode, setMode] = useState<QuickViewMode>('overview')
  const [runtime, setRuntime] = useState<SolanaRuntimeStatusSummary | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.daemon.settings.getSolanaRuntimeStatus().then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setRuntime(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const navigateToWallet = () => {
    closeAll()
    useUIStore.getState().openWorkspaceTool('wallet')
  }

  const goBack = useCallback(() => setMode('overview'), [])

  const portfolio = dashboard?.portfolio
  const activeWallet = dashboard?.activeWallet
  const holdings = activeWallet?.holdings ?? []
  const visibleHoldings = holdings.slice(0, 6)
  const walletId = activeWallet?.id ?? ''
  const walletName = activeWallet?.name ?? 'Tracked wallet'
  const walletAddress = activeWallet?.address ?? ''

  const isPositive = (portfolio?.delta24hUsd ?? 0) >= 0
  const executionLabel = runtime?.executionBackend.label ?? 'Shared RPC executor'
  const signerLabel = walletAddress ? shortAddr(walletAddress) : walletName

  // Reset mode when popout closes
  const handleClose = useCallback(() => {
    closeAll()
    setMode('overview')
  }, [closeAll])

  const renderContent = () => {
    switch (mode) {
      case 'send':
        return (
          <SendView
            walletId={walletId}
            holdings={holdings}
            onBack={goBack}
            executionLabel={executionLabel}
            signerLabel={signerLabel}
          />
        )
      case 'swap':
        return (
          <SwapView
            walletId={walletId}
            holdings={holdings}
            onBack={goBack}
            executionLabel={executionLabel}
            signerLabel={signerLabel}
          />
        )
      case 'receive':
        return (
          <ReceiveView
            address={walletAddress}
            onBack={goBack}
          />
        )
      default:
        return (
          <>
            <div className="quickview-wallet-meta">
              <div className="quickview-wallet-meta-copy">
                <div className="quickview-wallet-eyebrow">Active wallet</div>
                <div className="quickview-wallet-name">{walletName}</div>
                <div className="quickview-wallet-address">
                  {walletAddress ? shortAddr(walletAddress) : 'No wallet selected'} · {executionLabel}
                </div>
              </div>
              <button className="quickview-top-link" onClick={navigateToWallet}>
                Open drawer
              </button>
            </div>

            <div className="quickview-header">
              <div className="quickview-balance">
                ${portfolio ? formatCompactUsd(portfolio.totalUsd) : '0.00'}
              </div>
              {portfolio && (
                <div className={`quickview-delta ${isPositive ? 'quickview-delta--up' : 'quickview-delta--down'}`}>
                  <span>
                    {isPositive ? '+' : '-'}${formatCompactUsd(Math.abs(portfolio.delta24hUsd))}
                  </span>
                  <span>({isPositive ? '+' : ''}{portfolio.delta24hPct.toFixed(1)}%)</span>
                  <span className="quickview-delta-timeframe">24H</span>
                </div>
              )}
            </div>

            <div className="quickview-stat-grid">
              <Stat
                className="quickview-stat-card"
                label="Tracked tokens"
                labelClassName="quickview-stat-label"
                value={holdings.length}
                valueClassName="quickview-stat-value"
              />
              <Stat
                className="quickview-stat-card"
                label="Wallets"
                labelClassName="quickview-stat-label"
                value={portfolio?.walletCount ?? 0}
                valueClassName="quickview-stat-value"
              />
              <Stat
                className="quickview-stat-card"
                label="Execution"
                labelClassName="quickview-stat-label"
                value={executionLabel}
                valueClassName="quickview-stat-value quickview-stat-value--sm"
              />
            </div>

            <div className="quickview-actions">
              <button
                className="quickview-action-btn"
                onClick={() => setMode('send')}
                aria-label="Send SOL"
              >
                <svg className="quickview-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
                <span className="quickview-action-label">Send</span>
              </button>
              <button
                className="quickview-action-btn"
                onClick={() => setMode('swap')}
                aria-label="Swap tokens"
              >
                <svg className="quickview-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                <span className="quickview-action-label">Swap</span>
              </button>
              <button
                className="quickview-action-btn"
                onClick={() => setMode('receive')}
                aria-label="Receive SOL"
              >
                <svg className="quickview-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
                <span className="quickview-action-label">Receive</span>
              </button>
            </div>

            <div className="quickview-divider" />

            <div className="quickview-list quickview-list--tokens" role="list">
              {visibleHoldings.length === 0 ? (
                <div className="quickview-empty">No tokens found</div>
              ) : (
                visibleHoldings.map((token) => (
                  <div
                    key={token.mint}
                    className="quickview-token-row"
                    role="listitem"
                    onClick={navigateToWallet}
                  >
                    <div className={`quickview-token-icon ${!token.logoUri ? 'quickview-token-icon--fallback' : ''}`}>
                      {token.logoUri ? (
                        <img src={token.logoUri} alt="" />
                      ) : (
                        token.symbol.charAt(0)
                      )}
                    </div>
                    <div className="quickview-token-info">
                      <div className="quickview-token-symbol">{token.symbol}</div>
                      <div className="quickview-token-name">{token.name}</div>
                    </div>
                    <div className="quickview-token-amounts">
                      <div className="quickview-token-amount">
                        {formatAmount(token.amount)} {token.symbol}
                      </div>
                      <div className="quickview-token-usd">${formatCompactUsd(token.valueUsd)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="quickview-footer">
              <div className="quickview-footer-copy">Need the full wallet workflow?</div>
              <button className="quickview-footer-link" onClick={navigateToWallet}>
                Manage Wallets
              </button>
            </div>
          </>
        )
    }
  }

  return (
    <QuickView
      isOpen={isOpen}
      onClose={handleClose}
      triggerRef={triggerRef}
      anchor="below"
      variant="wallet"
    >
      {renderContent()}
    </QuickView>
  )
}
