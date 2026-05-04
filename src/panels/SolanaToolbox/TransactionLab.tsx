import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getSolanaRuntimeBlockers, type SolanaRuntimeStatusSummary, type SolanaRuntimeUseCase } from '../../../electron/shared/solanaRuntime'
import type { ReplayTrace, SolanaTransactionPreview, SolanaTransactionPreviewInput, WalletDashboard } from '../../../electron/shared/types'
import { useUIStore } from '../../store/ui'
import { TransactionPreviewCard } from '../WalletPanel/TransactionPreviewCard'

type TransactionLabKind = SolanaTransactionPreviewInput['kind']
type PipelineStatus = 'ready' | 'attention' | 'active' | 'blocked' | 'pending'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const LAB_MODES: Array<{
  id: TransactionLabKind
  label: string
  useCase: SolanaRuntimeUseCase
}> = [
  { id: 'send-sol', label: 'Send SOL', useCase: 'sends' },
  { id: 'send-token', label: 'Send Token', useCase: 'sends' },
  { id: 'swap', label: 'Swap', useCase: 'swaps' },
  { id: 'launch', label: 'Launch', useCase: 'launches' },
]

interface WalletOption {
  id: string
  name: string
  address: string
  isDefault: boolean
  totalUsd: number
  tokenCount: number
}

function shortKey(value: string | null | undefined, head = 6, tail = 4): string {
  if (!value) return 'Not set'
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function parseAmount(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseBps(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50
}

function formatLamports(lamports: number): string {
  return `${(lamports / 1_000_000_000).toFixed(6)} SOL`
}

function getWalletOptions(dashboard: WalletDashboard | null): WalletOption[] {
  if (!dashboard) return []
  const options = new Map<string, WalletOption>()

  for (const wallet of dashboard.wallets) {
    options.set(wallet.id, {
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      isDefault: wallet.isDefault,
      totalUsd: wallet.totalUsd,
      tokenCount: wallet.tokenCount,
    })
  }

  if (dashboard.activeWallet && !options.has(dashboard.activeWallet.id)) {
    options.set(dashboard.activeWallet.id, {
      id: dashboard.activeWallet.id,
      name: dashboard.activeWallet.name,
      address: dashboard.activeWallet.address,
      isDefault: true,
      totalUsd: dashboard.activeWallet.holdings.reduce((sum, holding) => sum + holding.valueUsd, 0),
      tokenCount: dashboard.activeWallet.holdings.length,
    })
  }

  return Array.from(options.values())
}

function statusLabel(status: PipelineStatus): string {
  if (status === 'ready') return 'Ready'
  if (status === 'attention') return 'Review'
  if (status === 'active') return 'Running'
  if (status === 'blocked') return 'Blocked'
  return 'Waiting'
}

export function TransactionLab() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const [kind, setKind] = useState<TransactionLabKind>('send-sol')
  const [dashboard, setDashboard] = useState<WalletDashboard | null>(null)
  const [runtime, setRuntime] = useState<SolanaRuntimeStatusSummary | null>(null)
  const [selectedWalletId, setSelectedWalletId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [destination, setDestination] = useState('')
  const [sendAmount, setSendAmount] = useState('0.01')
  const [sendMax, setSendMax] = useState(false)
  const [tokenMint, setTokenMint] = useState('')
  const [swapInputMint, setSwapInputMint] = useState(SOL_MINT)
  const [swapOutputMint, setSwapOutputMint] = useState(USDC_MINT)
  const [swapAmount, setSwapAmount] = useState('0.1')
  const [swapOutputAmount, setSwapOutputAmount] = useState('')
  const [swapSlippageBps, setSwapSlippageBps] = useState('50')
  const [swapPriceImpactPct, setSwapPriceImpactPct] = useState('0')
  const [launchProtocol, setLaunchProtocol] = useState('Pump.fun')
  const [launchSymbol, setLaunchSymbol] = useState('DEV')
  const [launchMint, setLaunchMint] = useState('')
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [rpcLabel, setRpcLabel] = useState('')
  const [replaySignature, setReplaySignature] = useState('')
  const [trace, setTrace] = useState<ReplayTrace | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayError, setReplayError] = useState<string | null>(null)

  const mode = LAB_MODES.find((entry) => entry.id === kind) ?? LAB_MODES[0]
  const walletOptions = useMemo(() => getWalletOptions(dashboard), [dashboard])
  const selectedWallet = walletOptions.find((wallet) => wallet.id === selectedWalletId) ?? null
  const activeHoldings = dashboard?.activeWallet?.id === selectedWalletId ? dashboard.activeWallet.holdings : []
  const tokenOptions = activeHoldings.filter((holding) => holding.mint !== SOL_MINT)
  const selectedToken = tokenOptions.find((holding) => holding.mint === tokenMint)
  const blockers = useMemo(() => getSolanaRuntimeBlockers(runtime, mode.useCase), [mode.useCase, runtime])
  const executionReady = blockers.length === 0

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void Promise.all([
      window.daemon.wallet.dashboard(activeProjectId ?? null),
      window.daemon.settings.getSolanaRuntimeStatus(),
      window.daemon.replay.rpcLabel().catch(() => ({ ok: false as const, error: 'Replay RPC unavailable' })),
    ]).then(([walletRes, runtimeRes, rpcRes]) => {
      if (cancelled) return

      if (walletRes.ok && walletRes.data) {
        setDashboard(walletRes.data)
        const options = getWalletOptions(walletRes.data)
        setSelectedWalletId((current) => (
          current && options.some((wallet) => wallet.id === current)
            ? current
            : walletRes.data?.activeWallet?.id ?? options.find((wallet) => wallet.isDefault)?.id ?? options[0]?.id ?? ''
        ))
      } else {
        setLoadError(walletRes.error ?? 'Wallet dashboard unavailable')
      }

      if (runtimeRes.ok && runtimeRes.data) setRuntime(runtimeRes.data)
      if (rpcRes.ok && typeof rpcRes.data === 'string') setRpcLabel(rpcRes.data)
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Transaction lab failed to load')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  useEffect(() => {
    if (!tokenMint && tokenOptions[0]) setTokenMint(tokenOptions[0].mint)
  }, [tokenMint, tokenOptions])

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
  }, [
    destination,
    kind,
    launchMint,
    launchProtocol,
    launchSymbol,
    selectedWalletId,
    sendAmount,
    sendMax,
    swapAmount,
    swapInputMint,
    swapOutputAmount,
    swapOutputMint,
    swapPriceImpactPct,
    swapSlippageBps,
    tokenMint,
  ])

  const validationIssues = useMemo(() => {
    const issues: string[] = []
    if (!selectedWalletId) issues.push('Select a signer wallet.')

    if (kind === 'send-sol' || kind === 'send-token') {
      if (!destination.trim()) issues.push('Enter a destination address.')
      if (!sendMax && !parseAmount(sendAmount)) issues.push('Enter a positive amount.')
    }

    if (kind === 'send-token' && !tokenMint.trim()) {
      issues.push('Enter a token mint.')
    }

    if (kind === 'swap') {
      if (!swapInputMint.trim() || !swapOutputMint.trim()) issues.push('Enter input and output mints.')
      if (swapInputMint.trim() === swapOutputMint.trim()) issues.push('Input and output mints must differ.')
      if (!parseAmount(swapAmount)) issues.push('Enter a positive swap amount.')
    }

    if (kind === 'launch') {
      if (!launchProtocol.trim()) issues.push('Select a launch protocol.')
      if (!launchSymbol.trim() && !launchMint.trim()) issues.push('Enter a token symbol or mint.')
    }

    return issues
  }, [
    destination,
    kind,
    launchMint,
    launchProtocol,
    launchSymbol,
    selectedWalletId,
    sendAmount,
    sendMax,
    swapAmount,
    swapInputMint,
    swapOutputMint,
    tokenMint,
  ])

  const buildPreviewInput = useCallback((): SolanaTransactionPreviewInput | null => {
    if (validationIssues.length > 0) return null

    if (kind === 'send-sol') {
      return {
        kind,
        walletId: selectedWalletId,
        destination: destination.trim(),
        amount: parseAmount(sendAmount),
        sendMax,
      }
    }

    if (kind === 'send-token') {
      return {
        kind,
        walletId: selectedWalletId,
        destination: destination.trim(),
        amount: parseAmount(sendAmount),
        sendMax,
        mint: tokenMint.trim(),
        tokenSymbol: selectedToken?.symbol,
      }
    }

    if (kind === 'swap') {
      return {
        kind,
        walletId: selectedWalletId,
        inputMint: swapInputMint.trim(),
        outputMint: swapOutputMint.trim(),
        inputSymbol: swapInputMint === SOL_MINT ? 'SOL' : shortKey(swapInputMint),
        outputSymbol: swapOutputMint === USDC_MINT ? 'USDC' : shortKey(swapOutputMint),
        inputAmount: swapAmount.trim(),
        outputAmount: swapOutputAmount.trim() || 'Quote pending',
        amount: parseAmount(swapAmount),
        slippageBps: parseBps(swapSlippageBps),
        priceImpactPct: swapPriceImpactPct.trim() || '0',
      }
    }

    return {
      kind,
      walletId: selectedWalletId,
      protocol: launchProtocol.trim(),
      tokenSymbol: launchSymbol.trim(),
      mint: launchMint.trim(),
    }
  }, [
    destination,
    kind,
    launchMint,
    launchProtocol,
    launchSymbol,
    selectedToken?.symbol,
    selectedWalletId,
    sendAmount,
    sendMax,
    swapAmount,
    swapInputMint,
    swapOutputAmount,
    swapOutputMint,
    swapPriceImpactPct,
    swapSlippageBps,
    tokenMint,
    validationIssues.length,
  ])

  const handlePreview = async () => {
    const input = buildPreviewInput()
    if (!input) {
      setPreviewError(validationIssues[0] ?? 'Transaction details are incomplete')
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const res = await window.daemon.wallet.transactionPreview(input)
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Transaction preview failed')
      setPreview(res.data)
    } catch (error) {
      setPreview(null)
      setPreviewError(error instanceof Error ? error.message : 'Transaction preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleReplay = async (event: FormEvent) => {
    event.preventDefault()
    const signature = replaySignature.trim()
    if (!signature) return

    setReplayLoading(true)
    setReplayError(null)
    setTrace(null)

    try {
      const res = await window.daemon.replay.fetchTrace(signature)
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Replay trace failed')
      setTrace(res.data)
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'Replay trace failed')
    } finally {
      setReplayLoading(false)
    }
  }

  const pipeline = useMemo<Array<{ label: string; detail: string; status: PipelineStatus }>>(() => [
    {
      label: 'Prepare',
      detail: selectedWallet ? `${selectedWallet.name} selected` : 'Wallet needed',
      status: selectedWallet ? 'ready' : 'blocked',
    },
    {
      label: 'Preview',
      detail: preview ? preview.title : previewLoading ? 'Building review' : 'Ready to inspect',
      status: previewLoading ? 'active' : preview ? (preview.warnings.length ? 'attention' : 'ready') : 'pending',
    },
    {
      label: 'Sign',
      detail: executionReady ? 'Wallet handoff ready' : 'Runtime gaps',
      status: selectedWallet && executionReady ? 'pending' : 'blocked',
    },
    {
      label: 'Broadcast',
      detail: runtime?.executionPath?.label ?? runtime?.executionBackend.label ?? 'Runtime pending',
      status: executionReady ? 'pending' : 'blocked',
    },
    {
      label: 'Replay',
      detail: trace ? `${trace.instructions.length} instructions` : 'Signature debugger',
      status: replayLoading ? 'active' : trace ? (trace.success ? 'ready' : 'attention') : 'pending',
    },
  ], [executionReady, preview, previewLoading, replayLoading, runtime, selectedWallet, trace])

  const previewDisabled = previewLoading || validationIssues.length > 0
  const recentActivity = dashboard?.recentActivity.filter((entry) => entry.signature).slice(0, 4) ?? []

  return (
    <section className="solana-transaction-lab">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Transaction Lab</div>
          <h3 className="solana-token-launch-title">Preflight, preview, and replay in one lane</h3>
          <p className="solana-token-launch-copy">
            Build a transaction review from the same wallet, runtime, and replay services used by DAEMON's execution surfaces.
          </p>
        </div>
        <div className="solana-transaction-lab-actions">
          <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('wallet')}>Open Wallet</button>
          <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('replay-engine')}>Open Replay</button>
        </div>
      </div>

      <div className="solana-transaction-lab-pipeline" aria-label="Transaction pipeline">
        {pipeline.map((step) => (
          <div key={step.label} className={`solana-transaction-lab-step ${step.status}`}>
            <div className="solana-transaction-lab-step-top">
              <span>{step.label}</span>
              <strong>{statusLabel(step.status)}</strong>
            </div>
            <div className="solana-transaction-lab-step-detail">{step.detail}</div>
          </div>
        ))}
      </div>

      <div className="solana-transaction-lab-grid">
        <section className="solana-transaction-lab-card">
          <div className="solana-transaction-lab-card-head">
            <div>
              <div className="solana-runtime-title">Builder</div>
              <div className="solana-transaction-lab-wallet">
                {selectedWallet ? `${selectedWallet.name} (${shortKey(selectedWallet.address)})` : loading ? 'Loading wallets' : 'No signer wallet'}
              </div>
            </div>
            <span className={`solana-runtime-status ${executionReady ? 'live' : 'setup'}`}>
              {executionReady ? 'Preflight Ready' : 'Preflight Blocked'}
            </span>
          </div>

          <div className="solana-transaction-lab-modes" role="tablist" aria-label="Transaction type">
            {LAB_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={kind === entry.id}
                className={`solana-transaction-lab-mode${kind === entry.id ? ' active' : ''}`}
                onClick={() => setKind(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="solana-transaction-lab-fields">
            <label className="solana-transaction-lab-field" htmlFor="transaction-lab-wallet">
              <span>Signer</span>
              <select
                id="transaction-lab-wallet"
                className="solana-transaction-lab-input"
                value={selectedWalletId}
                onChange={(event) => setSelectedWalletId(event.target.value)}
                disabled={walletOptions.length === 0}
              >
                <option value="">Select wallet</option>
                {walletOptions.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}{wallet.isDefault ? ' - default' : ''} ({shortKey(wallet.address)})
                  </option>
                ))}
              </select>
            </label>

            {(kind === 'send-sol' || kind === 'send-token') && (
              <>
                <label className="solana-transaction-lab-field" htmlFor="transaction-lab-destination">
                  <span>Destination</span>
                  <input
                    id="transaction-lab-destination"
                    className="solana-transaction-lab-input"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Recipient address"
                  />
                </label>

                {kind === 'send-token' && (
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-token">
                    <span>Token mint</span>
                    <input
                      id="transaction-lab-token"
                      className="solana-transaction-lab-input"
                      value={tokenMint}
                      list="transaction-lab-token-options"
                      onChange={(event) => setTokenMint(event.target.value)}
                      placeholder="Mint address"
                    />
                    <datalist id="transaction-lab-token-options">
                      {tokenOptions.map((holding) => (
                        <option key={holding.mint} value={holding.mint}>{holding.symbol}</option>
                      ))}
                    </datalist>
                  </label>
                )}

                <div className="solana-transaction-lab-inline">
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-amount">
                    <span>Amount</span>
                    <input
                      id="transaction-lab-amount"
                      className="solana-transaction-lab-input"
                      value={sendAmount}
                      onChange={(event) => setSendAmount(event.target.value)}
                      type="number"
                      step="any"
                      min="0"
                      disabled={sendMax}
                    />
                  </label>
                  <label className="solana-transaction-lab-check">
                    <input
                      type="checkbox"
                      checked={sendMax}
                      onChange={(event) => setSendMax(event.target.checked)}
                    />
                    <span>Send max</span>
                  </label>
                </div>
              </>
            )}

            {kind === 'swap' && (
              <>
                <label className="solana-transaction-lab-field" htmlFor="transaction-lab-swap-input">
                  <span>Input mint</span>
                  <input
                    id="transaction-lab-swap-input"
                    className="solana-transaction-lab-input"
                    value={swapInputMint}
                    onChange={(event) => setSwapInputMint(event.target.value)}
                  />
                </label>
                <label className="solana-transaction-lab-field" htmlFor="transaction-lab-swap-output">
                  <span>Output mint</span>
                  <input
                    id="transaction-lab-swap-output"
                    className="solana-transaction-lab-input"
                    value={swapOutputMint}
                    onChange={(event) => setSwapOutputMint(event.target.value)}
                  />
                </label>
                <div className="solana-transaction-lab-inline">
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-swap-amount">
                    <span>Input amount</span>
                    <input
                      id="transaction-lab-swap-amount"
                      className="solana-transaction-lab-input"
                      value={swapAmount}
                      onChange={(event) => setSwapAmount(event.target.value)}
                      type="number"
                      step="any"
                      min="0"
                    />
                  </label>
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-slippage">
                    <span>Slippage bps</span>
                    <input
                      id="transaction-lab-slippage"
                      className="solana-transaction-lab-input"
                      value={swapSlippageBps}
                      onChange={(event) => setSwapSlippageBps(event.target.value)}
                      type="number"
                      step="1"
                      min="1"
                    />
                  </label>
                </div>
                <div className="solana-transaction-lab-inline">
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-output-amount">
                    <span>Output amount</span>
                    <input
                      id="transaction-lab-output-amount"
                      className="solana-transaction-lab-input"
                      value={swapOutputAmount}
                      onChange={(event) => setSwapOutputAmount(event.target.value)}
                      placeholder="Quote output"
                    />
                  </label>
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-impact">
                    <span>Impact %</span>
                    <input
                      id="transaction-lab-impact"
                      className="solana-transaction-lab-input"
                      value={swapPriceImpactPct}
                      onChange={(event) => setSwapPriceImpactPct(event.target.value)}
                      type="number"
                      step="any"
                      min="0"
                    />
                  </label>
                </div>
              </>
            )}

            {kind === 'launch' && (
              <>
                <label className="solana-transaction-lab-field" htmlFor="transaction-lab-protocol">
                  <span>Protocol</span>
                  <select
                    id="transaction-lab-protocol"
                    className="solana-transaction-lab-input"
                    value={launchProtocol}
                    onChange={(event) => setLaunchProtocol(event.target.value)}
                  >
                    <option value="Pump.fun">Pump.fun</option>
                    <option value="Raydium LaunchLab">Raydium LaunchLab</option>
                    <option value="Meteora DBC">Meteora DBC</option>
                    <option value="Custom adapter">Custom adapter</option>
                  </select>
                </label>
                <div className="solana-transaction-lab-inline">
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-symbol">
                    <span>Symbol</span>
                    <input
                      id="transaction-lab-symbol"
                      className="solana-transaction-lab-input"
                      value={launchSymbol}
                      onChange={(event) => setLaunchSymbol(event.target.value)}
                    />
                  </label>
                  <label className="solana-transaction-lab-field" htmlFor="transaction-lab-mint">
                    <span>Mint</span>
                    <input
                      id="transaction-lab-mint"
                      className="solana-transaction-lab-input"
                      value={launchMint}
                      onChange={(event) => setLaunchMint(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          {(validationIssues.length > 0 || blockers.length > 0 || loadError) && (
            <div className="solana-transaction-lab-warning-list">
              {loadError && <div className="solana-transaction-lab-warning">{loadError}</div>}
              {validationIssues.map((issue) => <div key={issue} className="solana-transaction-lab-warning">{issue}</div>)}
              {blockers.map((blocker) => <div key={blocker} className="solana-transaction-lab-warning">{blocker}</div>)}
            </div>
          )}

          <div className="solana-transaction-lab-footer">
            <button
              type="button"
              className="sol-btn green"
              onClick={() => void handlePreview()}
              disabled={previewDisabled}
            >
              {previewLoading ? 'Previewing...' : 'Preview Transaction'}
            </button>
            {kind === 'swap' && (
              <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('wallet')}>Quote in Wallet</button>
            )}
            {kind === 'launch' && (
              <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('token-launch')}>Open Launch</button>
            )}
          </div>
        </section>

        <section className="solana-transaction-lab-card">
          <div className="solana-runtime-title">Preview</div>
          {preview ? (
            <TransactionPreviewCard
              title={preview.title}
              backendLabel={preview.backendLabel}
              signerLabel={preview.signerLabel}
              destinationLabel={preview.targetLabel}
              amountLabel={preview.amountLabel}
              feeLabel={preview.feeLabel}
              warnings={preview.warnings}
              notes={preview.notes}
            />
          ) : (
            <div className="solana-empty">
              {previewError ?? (loading ? 'Loading wallet and runtime state...' : 'No transaction preview yet.')}
            </div>
          )}

          <div className="solana-transaction-lab-context-grid">
            <div className="solana-transaction-lab-context">
              <span>Execution</span>
              <strong>{runtime?.executionBackend.label ?? 'Runtime pending'}</strong>
            </div>
            <div className="solana-transaction-lab-context">
              <span>RPC</span>
              <strong>{runtime?.rpc.label ?? (rpcLabel ? shortKey(rpcLabel, 18, 10) : 'Unknown')}</strong>
            </div>
            <div className="solana-transaction-lab-context">
              <span>Wallets</span>
              <strong>{dashboard?.portfolio.walletCount ?? walletOptions.length}</strong>
            </div>
            <div className="solana-transaction-lab-context">
              <span>Project</span>
              <strong>{activeProjectPath ? shortKey(activeProjectPath.replace(/\\/g, '/'), 18, 18) : 'No project'}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="solana-transaction-lab-replay">
        <div className="solana-transaction-lab-replay-main">
          <div className="solana-runtime-title">Replay lane</div>
          <form className="solana-transaction-lab-replay-form" onSubmit={handleReplay}>
            <input
              className="solana-transaction-lab-input"
              value={replaySignature}
              onChange={(event) => setReplaySignature(event.target.value)}
              placeholder="Transaction signature"
            />
            <button type="submit" className="sol-btn" disabled={replayLoading || !replaySignature.trim()}>
              {replayLoading ? 'Replaying...' : 'Replay Signature'}
            </button>
          </form>

          {recentActivity.length > 0 && (
            <div className="solana-transaction-lab-activity-list">
              {recentActivity.map((entry) => (
                <button
                  key={entry.signature}
                  type="button"
                  className="solana-transaction-lab-activity"
                  onClick={() => setReplaySignature(entry.signature)}
                >
                  <span>{entry.type ?? 'transaction'}</span>
                  <code>{shortKey(entry.signature, 8, 8)}</code>
                </button>
              ))}
            </div>
          )}

          {replayError && <div className="solana-transaction-lab-warning">{replayError}</div>}
        </div>

        <div className="solana-transaction-lab-trace">
          {trace ? (
            <>
              <div className="solana-transaction-lab-trace-top">
                <span className={`solana-runtime-status ${trace.success ? 'live' : 'setup'}`}>
                  {trace.success ? 'Confirmed' : 'Failed'}
                </span>
                <code>{shortKey(trace.signature, 10, 10)}</code>
              </div>
              <div className="solana-transaction-lab-context-grid compact">
                <div className="solana-transaction-lab-context">
                  <span>Slot</span>
                  <strong>{trace.slot.toLocaleString()}</strong>
                </div>
                <div className="solana-transaction-lab-context">
                  <span>Fee</span>
                  <strong>{formatLamports(trace.fee)}</strong>
                </div>
                <div className="solana-transaction-lab-context">
                  <span>Compute</span>
                  <strong>{trace.computeUnitsConsumed?.toLocaleString() ?? 'Unknown'}</strong>
                </div>
                <div className="solana-transaction-lab-context">
                  <span>Programs</span>
                  <strong>{trace.programIds.length}</strong>
                </div>
              </div>
              {trace.anchorError && (
                <div className="solana-transaction-lab-warning">
                  {trace.anchorError.errorMessage ?? trace.anchorError.raw}
                </div>
              )}
            </>
          ) : (
            <div className="solana-empty">Paste a confirmed signature or pick recent wallet activity.</div>
          )}
        </div>
      </section>
    </section>
  )
}
