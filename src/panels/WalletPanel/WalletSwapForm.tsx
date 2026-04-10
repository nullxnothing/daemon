import { useEffect, useRef, useState } from 'react'
import './WalletPanel.css'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const COMMON_TOKENS = [
  { mint: SOL_MINT, symbol: 'SOL', decimals: 9 },
  { mint: USDC_MINT, symbol: 'USDC', decimals: 6 },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
] as const

interface SwapQuote {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan: Array<{ label: string; percent: number }>
  // Raw Jupiter quoteResponse, passed back to execute so the backend uses the
  // exact same quote the user saw rather than fetching a fresh one at a different price.
  rawQuoteResponse: unknown
}

interface WalletSwapFormProps {
  walletId: string
  walletName: string
  holdings: Array<{ mint: string; symbol: string; amount: number; decimals?: number }>
  executionMode: WalletInfrastructureSettings['executionMode']
  initialInputMint?: string
  initialOutputMint?: string
  onBack: () => void
  onRefresh: () => Promise<void>
}

// Confirmation step state — shown between "Get Quote" and "Execute Swap"
interface PendingSwap {
  quote: SwapQuote
  // Raw Jupiter quoteResponse to pass to execute (avoids re-fetching a different price)
  rawQuoteResponse: unknown
  inputSymbol: string
  outputSymbol: string
  slippagePct: string
  impactPct: number
  // Timestamp when the user opened the confirmation dialog — sent to main process
  // so it can enforce that confirmation happened within the last 60 seconds.
  confirmedAt: number
}

export function WalletSwapForm({ walletId, walletName, holdings, executionMode, initialInputMint, initialOutputMint, onBack, onRefresh }: WalletSwapFormProps) {
  const [inputMint, setInputMint] = useState(initialInputMint ?? SOL_MINT)
  const [outputMint, setOutputMint] = useState(initialOutputMint ?? USDC_MINT)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState('50')

  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Confirmation dialog state
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null)
  const [highImpactAcknowledged, setHighImpactAcknowledged] = useState(false)

  const [swapLoading, setSwapLoading] = useState(false)
  const [swapResult, setSwapResult] = useState<WalletExecutionResult | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)

  // Ref-based mutex — prevents double-submit even if React state update is batched
  const swapLockRef = useRef(false)

  // Merge wallet holdings with common tokens for the dropdown
  const allTokens = mergeTokenLists(holdings)

  const inputToken = allTokens.find((t) => t.mint === inputMint)
  const outputToken = allTokens.find((t) => t.mint === outputMint)

  useEffect(() => {
    if (initialInputMint) setInputMint(initialInputMint)
    if (initialOutputMint) setOutputMint(initialOutputMint)
  }, [initialInputMint, initialOutputMint])

  const handleGetQuote = async () => {
    setQuoteError(null)
    setQuote(null)
    setSwapResult(null)
    setSwapError(null)
    setPendingSwap(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setQuoteError('Enter a valid amount')
      return
    }

    if (inputMint === outputMint) {
      setQuoteError('Input and output tokens must differ')
      return
    }

    setQuoteLoading(true)
    try {
      const res = await window.daemon.wallet.swapQuote({
        inputMint,
        outputMint,
        amount: parsedAmount,
        slippageBps: parseInt(slippageBps, 10),
      })

      if (res.ok && res.data) {
        setQuote(res.data)
      } else {
        setQuoteError(res.error ?? 'Failed to get quote')
      }
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Quote request failed')
    } finally {
      setQuoteLoading(false)
    }
  }

  // Show the confirmation dialog with the quoted values — does not execute yet.
  // We record the timestamp here so the main process can enforce the 60-second window.
  const handleRequestConfirm = () => {
    if (!quote) return
    const impactPct = parseFloat(quote.priceImpactPct)
    setPendingSwap({
      quote,
      rawQuoteResponse: quote.rawQuoteResponse,
      inputSymbol: inputToken?.symbol ?? shortMint(inputMint),
      outputSymbol: outputToken?.symbol ?? shortMint(outputMint),
      slippagePct: (parseInt(slippageBps, 10) / 100).toFixed(2),
      impactPct,
      confirmedAt: Date.now(),
    })
    setHighImpactAcknowledged(false)
  }

  const handleExecuteSwap = async () => {
    if (!pendingSwap) return
    if (swapLockRef.current) return
    swapLockRef.current = true

    setSwapLoading(true)
    setSwapError(null)
    setSwapResult(null)

    try {
      const res = await window.daemon.wallet.swapExecute({
        walletId,
        inputMint,
        outputMint,
        amount: parseFloat(amount),
        slippageBps: parseInt(slippageBps, 10),
        rawQuoteResponse: pendingSwap.rawQuoteResponse,
        confirmedAt: pendingSwap.confirmedAt,
        acknowledgedImpact: highImpactAcknowledged,
      })

      if (res.ok && res.data) {
        setSwapResult(res.data)
        setQuote(null)
        setPendingSwap(null)
        setAmount('')
        await onRefresh()
      } else {
        setSwapError(res.error ?? 'Swap failed')
        setPendingSwap(null)
      }
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Swap execution failed')
      setPendingSwap(null)
    } finally {
      setSwapLoading(false)
      swapLockRef.current = false
    }
  }

  const handleCancelConfirm = () => {
    setPendingSwap(null)
    setHighImpactAcknowledged(false)
  }

  const handleCancelQuote = () => {
    setQuote(null)
    setPendingSwap(null)
    setSwapError(null)
  }

  const handleFlipTokens = () => {
    setInputMint(outputMint)
    setOutputMint(inputMint)
    setQuote(null)
    setPendingSwap(null)
    setSwapResult(null)
    setSwapError(null)
  }

  // Price impact color + warning logic
  const impactPct = quote ? parseFloat(quote.priceImpactPct) : 0
  const impactColor = impactPct >= 5 ? 'var(--red)' : impactPct >= 1 ? 'var(--amber)' : 'var(--t3)'
  const isHighImpact = impactPct >= 1
  const isVeryHighImpact = impactPct >= 5
  const executeBlocked = isVeryHighImpact && !highImpactAcknowledged

  return (
    <section className="wallet-section">
      <div className="wallet-view-header">
        <button className="wallet-btn" onClick={onBack}>Back</button>
        <div className="wallet-section-title" style={{ margin: 0 }}>Swap</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="wallet-swap-container">
        <div className="wallet-caption">{walletName}</div>
        <div className="wallet-caption">Execution path: {executionMode === 'jito' ? 'Jito block engine' : 'Standard RPC'}</div>

        {/* Input token */}
        <div className="wallet-swap-field">
          <label className="wallet-caption">From</label>
          <select
            className="wallet-input"
            value={inputMint}
            onChange={(e) => { setInputMint(e.target.value); setQuote(null); setPendingSwap(null) }}
          >
            {allTokens.map((t) => (
              <option key={t.mint} value={t.mint}>
                {t.symbol} {t.balance !== undefined ? `(${formatTokenBalance(t.balance)})` : ''}
              </option>
            ))}
          </select>
          <input
            className="wallet-input"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setQuote(null); setPendingSwap(null) }}
            placeholder="Amount"
            type="number"
            step="any"
            min="0"
          />
        </div>

        {/* Flip button */}
        <div className="wallet-swap-flip">
          <button className="wallet-btn" onClick={handleFlipTokens} title="Swap direction">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>

        {/* Output token */}
        <div className="wallet-swap-field">
          <label className="wallet-caption">To</label>
          <select
            className="wallet-input"
            value={outputMint}
            onChange={(e) => { setOutputMint(e.target.value); setQuote(null); setPendingSwap(null) }}
          >
            {allTokens.map((t) => (
              <option key={t.mint} value={t.mint}>
                {t.symbol} {t.balance !== undefined ? `(${formatTokenBalance(t.balance)})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Slippage */}
        <div className="wallet-swap-field">
          <label className="wallet-caption">Slippage (bps)</label>
          <input
            className="wallet-input"
            value={slippageBps}
            onChange={(e) => setSlippageBps(e.target.value)}
            placeholder="50"
            type="number"
            step="1"
            min="1"
            max="5000"
          />
          <div className="wallet-caption">{(parseInt(slippageBps, 10) / 100).toFixed(2)}%</div>
        </div>

        {/* Custom mint input */}
        <div className="wallet-swap-field">
          <label className="wallet-caption">Or paste a token mint</label>
          <div className="wallet-swap-mint-row">
            <input
              className="wallet-input"
              placeholder="Input mint address"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v.length >= 32) { setInputMint(v); setQuote(null); setPendingSwap(null) }
              }}
            />
            <input
              className="wallet-input"
              placeholder="Output mint address"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v.length >= 32) { setOutputMint(v); setQuote(null); setPendingSwap(null) }
              }}
            />
          </div>
        </div>

        {/* Get Quote button — only shown when no active quote */}
        {!quote && !pendingSwap && (
          <button
            className="wallet-btn primary wallet-btn-full"
            disabled={quoteLoading}
            onClick={handleGetQuote}
          >
            {quoteLoading ? 'Getting Quote...' : 'Get Quote'}
          </button>
        )}

        {/* Quote summary — shown after fetching, before confirmation */}
        {quote && !pendingSwap && (
          <div className="wallet-swap-quote">
            <div className="wallet-label">Quote</div>
            <div className="wallet-caption">
              {formatLargeNumber(quote.inAmount)} {inputToken?.symbol ?? shortMint(inputMint)} →{' '}
              {formatLargeNumber(quote.outAmount)} {outputToken?.symbol ?? shortMint(outputMint)}
            </div>
            <div className="wallet-caption" style={{ color: impactColor }}>
              Price impact: {impactPct.toFixed(4)}%
              {isVeryHighImpact && ' — Very high price impact'}
              {!isVeryHighImpact && isHighImpact && ' — High price impact'}
            </div>
            {quote.routePlan.length > 0 && (
              <div className="wallet-caption">
                Route: {quote.routePlan.map((r) => `${r.label} (${r.percent}%)`).join(' → ')}
              </div>
            )}
            <div className="wallet-actions" style={{ marginTop: 6 }}>
              <button
                className="wallet-btn primary"
                onClick={handleRequestConfirm}
              >
                Review Swap
              </button>
              <button className="wallet-btn" onClick={handleCancelQuote}>Cancel</button>
            </div>
          </div>
        )}

        {/* Confirmation panel — shown after "Review Swap" is clicked */}
        {pendingSwap && (
          <div className="wallet-swap-quote">
            <div className="wallet-label">Confirm Swap</div>
            <div className="wallet-caption">
              {formatLargeNumber(pendingSwap.quote.inAmount)} {pendingSwap.inputSymbol}
              {' → '}
              {formatLargeNumber(pendingSwap.quote.outAmount)} {pendingSwap.outputSymbol}
            </div>
            <div className="wallet-caption" style={{ color: pendingSwap.impactPct >= 5 ? 'var(--red)' : pendingSwap.impactPct >= 1 ? 'var(--amber)' : 'var(--t3)' }}>
              Price impact: {pendingSwap.impactPct.toFixed(4)}%
              {pendingSwap.impactPct >= 5 && ' — Very high price impact'}
              {pendingSwap.impactPct < 5 && pendingSwap.impactPct >= 1 && ' — High price impact'}
            </div>
            <div className="wallet-caption">Slippage: {pendingSwap.slippagePct}%</div>

            {pendingSwap.impactPct >= 5 && (
              <label className="wallet-swap-ack-row">
                <input
                  type="checkbox"
                  checked={highImpactAcknowledged}
                  onChange={(e) => setHighImpactAcknowledged(e.target.checked)}
                />
                <span className="wallet-caption" style={{ color: 'var(--red)' }}>
                  I understand the price impact
                </span>
              </label>
            )}

            <div className="wallet-actions" style={{ marginTop: 8 }}>
              <button
                className="wallet-btn primary"
                disabled={swapLoading || executeBlocked}
                onClick={handleExecuteSwap}
              >
                {swapLoading ? 'Swapping...' : 'Confirm Swap'}
              </button>
              <button className="wallet-btn" onClick={handleCancelConfirm} disabled={swapLoading}>Cancel</button>
            </div>
          </div>
        )}

        {quoteError && <div className="wallet-empty">{quoteError}</div>}
        {swapError && <div className="wallet-empty">{swapError}</div>}
        {swapResult && (
          <div className="wallet-success-msg">
            Swap confirmed via {swapResult.transport === 'jito' ? 'Jito' : 'RPC'}! Sig: {swapResult.signature.slice(0, 8)}...{swapResult.signature.slice(-8)}
          </div>
        )}
      </div>
    </section>
  )
}

interface TokenOption {
  mint: string
  symbol: string
  balance?: number
  decimals?: number
}

function mergeTokenLists(
  holdings: Array<{ mint: string; symbol: string; amount: number; decimals?: number }>
): TokenOption[] {
  const seen = new Set<string>()
  const result: TokenOption[] = []

  // Add holdings first (user's tokens with balances)
  for (const h of holdings) {
    if (!seen.has(h.mint)) {
      seen.add(h.mint)
      result.push({ mint: h.mint, symbol: h.symbol, balance: h.amount, decimals: h.decimals })
    }
  }

  // Add common tokens that aren't in holdings
  for (const t of COMMON_TOKENS) {
    if (!seen.has(t.mint)) {
      seen.add(t.mint)
      result.push({ mint: t.mint, symbol: t.symbol, decimals: t.decimals })
    }
  }

  return result
}

function formatTokenBalance(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (value >= 1) return value.toFixed(2)
  return value.toFixed(4)
}

function formatLargeNumber(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return formatTokenBalance(num)
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`
}
