import { useEffect, useRef, useState } from 'react'
import { useNotificationsStore } from '../../store/notifications'
import { useUIStore } from '../../store/ui'
import './WalletPanel.css'
import { TransactionPipeline, TransactionPreviewCard, type TransactionPipelineStep } from './TransactionPreviewCard'
import { canOpenSolscan, getSolscanTxLabel, getSolscanTxUrl } from '../../lib/solanaExplorer'
import { buildPreviewUnavailableWarning, describeWalletActionError, getClusterDisplayName, getExecutionModeDisplayName } from './walletCopy'

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
  requestId: string
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
  cluster: WalletInfrastructureSettings['cluster']
  initialInputMint?: string
  initialOutputMint?: string
  onBack: () => void
  onRefresh: () => Promise<void>
}

// Confirmation step state — shown between "Get Quote" and "Sign and Swap"
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

export function WalletSwapForm({ walletId, walletName, holdings, executionMode, cluster, initialInputMint, initialOutputMint, onBack, onRefresh }: WalletSwapFormProps) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectName = useUIStore((s) => (
    s.activeProjectId ? s.projects.find((project) => project.id === s.activeProjectId)?.name ?? null : null
  ))
  const [inputMint, setInputMint] = useState(initialInputMint ?? SOL_MINT)
  const [outputMint, setOutputMint] = useState(initialOutputMint ?? USDC_MINT)
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState('50')
  const [searchedTokens, setSearchedTokens] = useState<TokenOption[]>([])
  const [tokenSearchQuery, setTokenSearchQuery] = useState('')
  const [tokenSearchTarget, setTokenSearchTarget] = useState<'input' | 'output'>('output')
  const [tokenSearchResults, setTokenSearchResults] = useState<JupiterTokenSearchResult[]>([])
  const [tokenSearchLoading, setTokenSearchLoading] = useState(false)
  const [tokenSearchError, setTokenSearchError] = useState<string | null>(null)

  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Confirmation dialog state
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null)
  const [highImpactAcknowledged, setHighImpactAcknowledged] = useState(false)

  const [swapLoading, setSwapLoading] = useState(false)
  const [swapResult, setSwapResult] = useState<WalletExecutionResult | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Ref-based mutex — prevents double-submit even if React state update is batched
  const swapLockRef = useRef(false)

  // Merge wallet holdings with common tokens for the dropdown
  const allTokens = mergeTokenLists(holdings, [initialInputMint, initialOutputMint], searchedTokens)

  const inputToken = allTokens.find((t) => t.mint === inputMint)
  const outputToken = allTokens.find((t) => t.mint === outputMint)
  const backendLabel = executionMode === 'jito' ? 'Shared Jito executor' : 'Shared RPC executor'
  const executionDisplay = getExecutionModeDisplayName(executionMode)
  const clusterDisplay = getClusterDisplayName(cluster)
  const currentSlippageBps = parseSlippageBps(slippageBps)
  const slippagePctLabel = currentSlippageBps == null ? 'Invalid' : (currentSlippageBps / 100).toFixed(2)
  const pipelineSteps = buildSwapPipelineSteps({
    quoted: Boolean(quote || pendingSwap),
    reviewing: Boolean(pendingSwap),
    submitting: swapLoading,
    succeeded: Boolean(swapResult),
    failed: Boolean(swapError),
  })

  useEffect(() => {
    if (initialInputMint) setInputMint(initialInputMint)
    if (initialOutputMint) setOutputMint(initialOutputMint)
  }, [initialInputMint, initialOutputMint])

  useEffect(() => {
    const query = tokenSearchQuery.trim()
    setTokenSearchError(null)

    if (query.length < 2) {
      setTokenSearchResults([])
      setTokenSearchLoading(false)
      return
    }

    let cancelled = false
    setTokenSearchLoading(true)
    const timeout = setTimeout(() => {
      void window.daemon.wallet.searchJupiterTokens(query).then((res) => {
        if (cancelled) return
        if (res.ok && res.data) {
          setTokenSearchResults(res.data)
        } else {
          setTokenSearchResults([])
          setTokenSearchError(res.error ?? 'Token search failed')
        }
      }).catch((err) => {
        if (cancelled) return
        setTokenSearchResults([])
        setTokenSearchError(err instanceof Error ? err.message : 'Token search failed')
      }).finally(() => {
        if (!cancelled) setTokenSearchLoading(false)
      })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [tokenSearchQuery])

  const handleSelectSearchToken = (token: JupiterTokenSearchResult) => {
    const nextToken = tokenSearchResultToOption(token)
    setSearchedTokens((prev) => upsertTokenOption(prev, nextToken))
    if (tokenSearchTarget === 'input') {
      setInputMint(token.mint)
    } else {
      setOutputMint(token.mint)
    }
    setQuote(null)
    setPendingSwap(null)
    setSwapResult(null)
    setSwapError(null)
    setTokenSearchQuery('')
    setTokenSearchResults([])
    setTokenSearchError(null)
  }

  const handleGetQuote = async () => {
    setQuoteError(null)
    setQuote(null)
    setSwapResult(null)
    setSwapError(null)
    setPendingSwap(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setQuoteError('Enter an amount greater than zero before requesting a quote.')
      return
    }

    if (inputMint === outputMint) {
      setQuoteError('Choose two different tokens before requesting a quote.')
      return
    }

    const parsedSlippageBps = parseSlippageBps(slippageBps)
    if (parsedSlippageBps == null) {
      setQuoteError('Slippage must be a whole number between 1 and 5000 bps')
      return
    }

    setQuoteLoading(true)
    try {
      const res = await window.daemon.wallet.swapQuote({
        walletId,
        inputMint,
        outputMint,
        amount: parsedAmount,
        slippageBps: parsedSlippageBps,
      })

      if (res.ok && res.data) {
        setQuote(res.data)
      } else {
        setQuoteError(describeWalletActionError(res.error, 'DAEMON could not get a Jupiter quote.'))
      }
    } catch (err) {
      setQuoteError(describeWalletActionError(err instanceof Error ? err.message : null, 'Quote request failed.'))
    } finally {
      setQuoteLoading(false)
    }
  }

  // Show the confirmation dialog with the quoted values — does not execute yet.
  // We record the timestamp here so the main process can enforce the 60-second window.
  const handleRequestConfirm = () => {
    if (!quote) return
    const parsedSlippageBps = parseSlippageBps(slippageBps)
    if (parsedSlippageBps == null) {
      setQuoteError('Slippage must be a whole number between 1 and 5000 bps')
      return
    }
    const impactPct = parseFloat(quote.priceImpactPct)
    setPendingSwap({
      quote,
      rawQuoteResponse: quote.rawQuoteResponse,
      inputSymbol: inputToken?.symbol ?? shortMint(inputMint),
      outputSymbol: outputToken?.symbol ?? shortMint(outputMint),
      slippagePct: (parsedSlippageBps / 100).toFixed(2),
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
    const parsedSlippageBps = parseSlippageBps(slippageBps)
    if (parsedSlippageBps == null) {
      setSwapLoading(false)
      setSwapError('Slippage must be a whole number between 1 and 5000 bps')
      swapLockRef.current = false
      return
    }
    const activity = useNotificationsStore.getState()
    activity.addActivity({
      kind: 'info',
      context: 'Wallet',
      message: `Executing Jupiter swap for ${amount} from ${inputMint} to ${outputMint}`,
      projectId: activeProjectId,
      projectName: activeProjectName,
    })

    try {
      const res = await window.daemon.wallet.swapExecute({
        walletId,
        inputMint,
        outputMint,
        amount: parseFloat(amount),
        slippageBps: parsedSlippageBps,
        rawQuoteResponse: pendingSwap.rawQuoteResponse,
        confirmedAt: pendingSwap.confirmedAt,
        acknowledgedImpact: highImpactAcknowledged,
      })

      if (res.ok && res.data) {
        setSwapResult(res.data)
        activity.addActivity({
          kind: 'success',
          context: 'Wallet',
          message: `Swap confirmed via ${res.data.transport.toUpperCase()} with signature ${res.data.signature}`,
          projectId: activeProjectId,
          projectName: activeProjectName,
          artifacts: [{
            type: 'transaction',
            label: getSolscanTxLabel(cluster),
            value: res.data.signature,
            href: getSolscanTxUrl(res.data.signature, cluster),
          }],
        })
        setQuote(null)
        setPendingSwap(null)
        setAmount('')
        await onRefresh()
      } else {
        const message = describeWalletActionError(res.error, 'Swap failed. Nothing was submitted.')
        activity.addActivity({
          kind: 'error',
          context: 'Wallet',
          message,
          projectId: activeProjectId,
          projectName: activeProjectName,
        })
        setSwapError(message)
        setPendingSwap(null)
      }
    } catch (err) {
      const message = describeWalletActionError(err instanceof Error ? err.message : null, 'Swap execution failed. Nothing was submitted.')
      activity.addActivity({
        kind: 'error',
        context: 'Wallet',
        message,
        projectId: activeProjectId,
        projectName: activeProjectName,
      })
      setSwapError(message)
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

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setPreviewError(null)

    if (!pendingSwap) return

    void window.daemon.wallet.transactionPreview({
      kind: 'swap',
      walletId,
      inputMint,
      outputMint,
      inputSymbol: pendingSwap.inputSymbol,
      outputSymbol: pendingSwap.outputSymbol,
      inputAmount: pendingSwap.quote.inAmount,
      outputAmount: pendingSwap.quote.outAmount,
      amount: parseFloat(amount),
      slippageBps: parseSlippageBps(slippageBps) ?? 0,
      priceImpactPct: pendingSwap.quote.priceImpactPct,
    }).then((res) => {
      if (cancelled) return
      if (!res.ok || !res.data) {
        setPreviewError(res.error ?? 'DAEMON could not prepare the swap preview.')
        return
      }
      setPreview(res.data)
    }).catch(() => {
      if (!cancelled) setPreviewError('DAEMON could not prepare the swap preview.')
    })

    return () => {
      cancelled = true
    }
  }, [amount, inputMint, outputMint, pendingSwap, slippageBps, walletId])

  return (
    <section className="wallet-section">
      <div className="wallet-view-header">
        <button type="button" className="wallet-btn" onClick={onBack}>Back</button>
        <div className="wallet-section-title" style={{ margin: 0 }}>Swap</div>
        <div style={{ width: 40 }} />
      </div>

        <div className="wallet-swap-container">
        <div className="wallet-caption">{walletName}</div>
        <div className="wallet-caption">Execution path: {executionDisplay} · Network: {clusterDisplay}</div>

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
          <button type="button" className="wallet-btn" onClick={handleFlipTokens} title="Swap direction">
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
            onChange={(e) => {
              setSlippageBps(e.target.value)
              setQuote(null)
              setPendingSwap(null)
              setSwapResult(null)
              setSwapError(null)
            }}
            placeholder="50"
            type="number"
            step="1"
            min="1"
            max="5000"
          />
          <div className={`wallet-caption${currentSlippageBps == null ? ' wallet-warning-text' : ''}`}>{slippagePctLabel}%</div>
        </div>

        <div className="wallet-swap-field">
          <label className="wallet-caption">Find token with Jupiter</label>
          <div className="wallet-swap-search-row">
            <select
              className="wallet-input wallet-swap-search-target"
              value={tokenSearchTarget}
              onChange={(e) => setTokenSearchTarget(e.target.value === 'input' ? 'input' : 'output')}
            >
              <option value="input">From</option>
              <option value="output">To</option>
            </select>
            <input
              className="wallet-input"
              value={tokenSearchQuery}
              onChange={(e) => setTokenSearchQuery(e.target.value)}
              placeholder="Search symbol, name, or mint"
            />
          </div>
          {tokenSearchLoading && <div className="wallet-caption">Searching Jupiter tokens...</div>}
          {tokenSearchError && <div className="wallet-caption wallet-warning-text">{tokenSearchError}</div>}
          {tokenSearchResults.length > 0 && (
            <div className="wallet-token-search-results">
              {tokenSearchResults.map((token) => (
                <button
                  key={token.mint}
                  type="button"
                  className="wallet-token-search-result"
                  onClick={() => handleSelectSearchToken(token)}
                  title={token.mint}
                >
                  {token.icon && <img src={token.icon} alt="" className="wallet-token-search-icon" />}
                  <span className="wallet-token-search-main">
                    <span className="wallet-token-search-symbol">{token.symbol}</span>
                    <span className="wallet-token-search-name">{token.name}</span>
                  </span>
                  <span className="wallet-token-search-meta">
                    {token.isSus ? 'Suspicious' : token.verified ? 'Verified' : token.organicScore != null ? `Score ${Math.round(token.organicScore)}` : shortMint(token.mint)}
                  </span>
                </button>
              ))}
            </div>
          )}
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
                Review swap quote
              </button>
              <button type="button" className="wallet-btn" onClick={handleCancelQuote}>Cancel</button>
            </div>
          </div>
        )}

        {/* Confirmation panel — shown after "Review Swap" is clicked */}
        {pendingSwap && (
          <div className="wallet-swap-quote">
            <TransactionPreviewCard
              title={preview?.title ?? 'Review Swap'}
              backendLabel={preview?.backendLabel ?? backendLabel}
              networkLabel={preview?.networkLabel ?? cluster}
              signerLabel={preview?.signerLabel ?? walletName}
              destinationLabel={preview?.targetLabel ?? `${pendingSwap.inputSymbol} → ${pendingSwap.outputSymbol}`}
              amountLabel={preview?.amountLabel ?? `${formatLargeNumber(pendingSwap.quote.inAmount)} ${pendingSwap.inputSymbol} → ${formatLargeNumber(pendingSwap.quote.outAmount)} ${pendingSwap.outputSymbol}`}
              feeLabel={preview?.feeLabel}
              warnings={[
                ...(preview?.warnings ?? []),
                ...(previewError ? [buildPreviewUnavailableWarning(previewError)] : []),
              ]}
              notes={preview?.notes ?? [
                `Slippage setting: ${pendingSwap.slippagePct}%`,
                `Price impact: ${pendingSwap.impactPct.toFixed(4)}%${pendingSwap.impactPct >= 5 ? ' (very high)' : pendingSwap.impactPct >= 1 ? ' (high)' : ''}`,
                'This quote confirmation expires after 60 seconds.',
                getSolscanTxLabel(cluster) === 'Copy signature' ? 'Localnet transactions cannot open in Solscan, so DAEMON will copy the signature after swap.' : `${getSolscanTxLabel(cluster)} will be available after confirmation.`,
              ]}
            />
            <TransactionPipeline steps={pipelineSteps} />

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
                {swapLoading ? 'Broadcasting...' : 'Sign and swap'}
              </button>
              <button type="button" className="wallet-btn" onClick={handleCancelConfirm} disabled={swapLoading}>Cancel</button>
            </div>
          </div>
        )}

        {quoteError && <div className="wallet-error-msg" role="alert">{quoteError}</div>}
        {swapError && <div className="wallet-error-msg" role="alert">{swapError}</div>}
        {swapResult && (
          <div className="wallet-success-msg">
            <span>Swap confirmed via {swapResult.transport === 'jupiter' ? 'Jupiter' : swapResult.transport === 'jito' ? 'Jito' : 'RPC'}: {swapResult.signature.slice(0, 8)}...{swapResult.signature.slice(-8)}</span>
            <button
              type="button"
              className="wallet-success-link"
              onClick={() => {
                if (canOpenSolscan(cluster)) {
                  void window.daemon.shell.openExternal(getSolscanTxUrl(swapResult.signature, cluster))
                } else {
                  void window.daemon.env.copyValue(swapResult.signature)
                }
              }}
            >
              {getSolscanTxLabel(cluster)}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function parseSlippageBps(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) return null
  return parsed
}

function buildSwapPipelineSteps(state: {
  quoted: boolean
  reviewing: boolean
  submitting: boolean
  succeeded: boolean
  failed: boolean
}): TransactionPipelineStep[] {
  return [
    {
      label: 'Quote',
      detail: state.quoted ? 'Jupiter route and price impact are available.' : 'Request a quote before review.',
      state: state.quoted ? 'complete' : 'idle',
    },
    {
      label: 'Review',
      detail: state.reviewing ? 'Confirm route, slippage, signer, and risk warnings.' : 'Review starts from a fresh quote.',
      state: state.submitting || state.succeeded || state.failed ? 'complete' : state.reviewing ? 'active' : 'idle',
    },
    {
      label: 'Execute',
      detail: state.submitting ? 'Submitting signed Jupiter order.' : state.succeeded ? 'Swap signature confirmed.' : state.failed ? 'Check the error before retrying.' : 'Execution waits for confirmation.',
      state: state.submitting ? 'active' : state.succeeded ? 'complete' : state.failed ? 'failed' : 'idle',
    },
  ]
}

interface TokenOption {
  mint: string
  symbol: string
  balance?: number
  decimals?: number
  name?: string
  icon?: string | null
  usdPrice?: number | null
  organicScore?: number | null
  isSus?: boolean
  verified?: boolean
}

function mergeTokenLists(
  holdings: Array<{ mint: string; symbol: string; amount: number; decimals?: number }>,
  extraMints: Array<string | undefined> = [],
  searchedTokens: TokenOption[] = [],
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

  for (const token of searchedTokens) {
    if (!seen.has(token.mint)) {
      seen.add(token.mint)
      result.push(token)
    }
  }

  // Add common tokens that aren't in holdings
  for (const t of COMMON_TOKENS) {
    if (!seen.has(t.mint)) {
      seen.add(t.mint)
      result.push({ mint: t.mint, symbol: t.symbol, decimals: t.decimals })
    }
  }

  for (const mint of extraMints) {
    if (!mint || seen.has(mint)) continue
    seen.add(mint)
    result.push({ mint, symbol: shortMint(mint) })
  }

  return result
}

function tokenSearchResultToOption(token: JupiterTokenSearchResult): TokenOption {
  return {
    mint: token.mint,
    symbol: token.symbol,
    decimals: token.decimals,
    name: token.name,
    icon: token.icon,
    usdPrice: token.usdPrice,
    organicScore: token.organicScore,
    isSus: token.isSus,
    verified: token.verified,
  }
}

function upsertTokenOption(tokens: TokenOption[], token: TokenOption): TokenOption[] {
  const without = tokens.filter((entry) => entry.mint !== token.mint)
  return [token, ...without].slice(0, 20)
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
