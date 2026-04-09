import { useState, useEffect, useRef } from 'react'
import { openLaunchInBrowserMode } from '../../lib/launchHandoff'
import { useNotificationsStore } from '../../store/notifications'
import { useUIStore } from '../../store/ui'
import { useTokenLaunch } from './useTokenLaunch'
import type { LaunchParams } from './useTokenLaunch'
import './LaunchWizard.css'

type Step = 1 | 2 | 3 | 4

const STEP_LABELS: Record<Step, string> = {
  1: 'Token Details',
  2: 'Launch Config',
  3: 'Preview',
  4: 'Executing',
}

const STEP_SUBTITLES: Record<Step, string> = {
  1: 'Name your token and set its identity',
  2: 'Configure your launch parameters',
  3: 'Review before committing',
  4: 'Broadcasting to the network',
}

const TOTAL_STEPS = 4

// ── Step 1 state ──────────────────────────────────────────────
interface Step1State {
  name: string
  symbol: string
  description: string
  imagePath: string | null
  imagePreviewUrl: string | null
  twitter: string
  telegram: string
  website: string
}

// ── Step 2 state ──────────────────────────────────────────────
interface Step2State {
  launchpad: LaunchpadId
  initialBuySol: string
  slippage: string
  priorityFee: string
  walletId: string
}

const PHASE_STEPS = [
  { key: 'creating', label: 'Creating token launch' },
] as const

type PhaseKey = typeof PHASE_STEPS[number]['key']

function phaseIndex(phase: string): number {
  return PHASE_STEPS.findIndex((s) => s.key === phase)
}

// ── Main component ─────────────────────────────────────────────
export function LaunchWizard() {
  const closeLaunchWizard = useUIStore((s) => s.closeLaunchWizard)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const overlayRef = useRef<HTMLDivElement>(null)
  const hasAutoHandedOffRef = useRef(false)

  const [step, setStep] = useState<Step>(1)
  const [hasAttemptedNext, setHasAttemptedNext] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [wallets, setWallets] = useState<LaunchWalletOption[]>([])
  const [launchpads, setLaunchpads] = useState<LaunchpadDefinition[]>([])
  const [preflight, setPreflight] = useState<TokenLaunchPreflight | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)

  const { state: launchState, launch, reset } = useTokenLaunch()

  const [s1, setS1] = useState<Step1State>({
    name: '',
    symbol: '',
    description: '',
    imagePath: null,
    imagePreviewUrl: null,
    twitter: '',
    telegram: '',
    website: '',
  })

  const [s2, setS2] = useState<Step2State>({
    launchpad: 'pumpfun',
    initialBuySol: '0.1',
    slippage: '10',
    priorityFee: '0.005',
    walletId: '',
  })

  // Close on Escape (window-level so it works regardless of focus)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 4) {
        e.preventDefault()
        e.stopPropagation()
        closeLaunchWizard()
      }
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [step, closeLaunchWizard])

  // Load wallets on mount
  useEffect(() => {
    window.daemon.launch.listWalletOptions(activeProjectId).then((res) => {
      if (res.ok && res.data) {
        const list = res.data
        setWallets(list)
        if (list.length > 0 && !s2.walletId) {
          const preferred = list.find((wallet) => wallet.isAssignedToActiveProject && wallet.hasKeypair)
            ?? list.find((wallet) => wallet.isDefault && wallet.hasKeypair)
            ?? list.find((wallet) => wallet.hasKeypair)
            ?? list.find((wallet) => wallet.isAssignedToActiveProject)
            ?? list.find((wallet) => wallet.isDefault)
            ?? list[0]
          setS2((prev) => ({ ...prev, walletId: preferred.id }))
        }
      }
    }).catch(() => {})
  }, [activeProjectId, s2.walletId])

  useEffect(() => {
    window.daemon.launch.listLaunchpads().then((res) => {
      if (!res.ok || !res.data) return
      setLaunchpads(res.data)
      const active = res.data.find((pad) => pad.enabled)
      if (active) {
        setS2((prev) => ({ ...prev, launchpad: active.id }))
      }
    }).catch(() => {})
  }, [])

  // Refresh balance when wallet changes
  useEffect(() => {
    if (!s2.walletId) return
    setWalletBalance(null)
    window.daemon.wallet.balance(s2.walletId).then((res) => {
      if (res.ok && res.data) setWalletBalance(res.data.sol)
    }).catch(() => {})
  }, [s2.walletId])

  const handlePickImage = async () => {
    const res = await window.daemon.launch.pickImage()
    if (res.ok && res.data) {
      const filePath = res.data
      // Read as base64 for preview
      const imgRes = await window.daemon.fs.readImageBase64(filePath)
      const previewUrl = imgRes.ok && imgRes.data ? imgRes.data.dataUrl : null
      setS1((prev) => ({ ...prev, imagePath: filePath, imagePreviewUrl: previewUrl }))
    }
  }

  const s2BuySol = parseFloat(s2.initialBuySol) || 0
  const s2Priority = parseFloat(s2.priorityFee) || 0
  const selectedWallet = wallets.find((wallet) => wallet.id === s2.walletId) ?? null
  const TX_BASE_COST = 0.02
  const totalCost = s2BuySol + s2Priority + TX_BASE_COST
  const isBalanceLow = walletBalance !== null && walletBalance < totalCost
  const selectedWalletMissingKeypair = selectedWallet ? !selectedWallet.hasKeypair : false
  const launchChecksPassing = preflight?.ready ?? false

  const canProceedStep1 =
    s1.name.trim().length > 0 &&
    s1.symbol.trim().length > 0 &&
    s1.description.trim().length > 0

  const canProceedStep2 =
    s2BuySol > 0 &&
    parseFloat(s2.slippage) > 0 &&
    s2Priority >= 0 &&
    s2.walletId.length > 0 &&
    !selectedWalletMissingKeypair

  const handleLaunch = () => {
    const params: LaunchParams = {
      launchpad: s2.launchpad,
      projectId: activeProjectId ?? undefined,
      name: s1.name.trim(),
      symbol: s1.symbol.trim().toUpperCase(),
      description: s1.description.trim(),
      imagePath: s1.imagePath,
      twitter: s1.twitter.trim(),
      telegram: s1.telegram.trim(),
      website: s1.website.trim(),
      initialBuySol: s2BuySol,
      slippageBps: Math.round(parseFloat(s2.slippage) * 100),
      priorityFeeSol: s2Priority,
      walletId: s2.walletId,
    }
    setStep(4)
    launch(params)
  }

  const handleRetry = () => {
    reset()
    setStep(3)
    setConfirmed(false)
  }

  const activePhaseIdx = phaseIndex(launchState.phase)
  const selectedLaunchpad = launchpads.find((pad) => pad.id === s2.launchpad) ?? null

  useEffect(() => {
    if (launchState.phase !== 'done' || !launchState.result) {
      hasAutoHandedOffRef.current = false
      return
    }
    if (hasAutoHandedOffRef.current) return
    if (s2.launchpad !== 'pumpfun' || !launchState.result.mint) return

    hasAutoHandedOffRef.current = true
    pushSuccess(`Opened ${s1.symbol.toUpperCase()} in Browser mode`, 'Token Launch')
    window.setTimeout(() => {
      closeLaunchWizard()
    }, 120)
  }, [launchState.phase, launchState.result, s2.launchpad, s1.symbol, pushSuccess, closeLaunchWizard])

  useEffect(() => {
    if (step !== 3) return
    if (!s2.walletId) return

    let cancelled = false
    const run = async () => {
      setPreflightLoading(true)
      setPreflightError(null)
      const res = await window.daemon.launch.preflightToken({
        launchpad: s2.launchpad,
        walletId: s2.walletId,
        projectId: activeProjectId ?? undefined,
        name: s1.name.trim(),
        symbol: s1.symbol.trim().toUpperCase(),
        description: s1.description.trim(),
        imagePath: s1.imagePath,
        twitter: s1.twitter.trim(),
        telegram: s1.telegram.trim(),
        website: s1.website.trim(),
        initialBuySol: s2BuySol,
        slippageBps: Math.round(parseFloat(s2.slippage) * 100),
        priorityFeeSol: s2Priority,
      })
      if (cancelled) return
      if (!res.ok || !res.data) {
        setPreflight(null)
        setPreflightError(res.error ?? 'Launch preflight failed')
      } else {
        setPreflight(res.data)
        setPreflightError(null)
      }
      setPreflightLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    step,
    s2.launchpad,
    s2.walletId,
    s2.initialBuySol,
    s2.priorityFee,
    s2.slippage,
    s1.name,
    s1.symbol,
    s1.description,
    s1.imagePath,
    s1.twitter,
    s1.telegram,
    s1.website,
    activeProjectId,
    s2BuySol,
    s2Priority,
  ])

  return (
    <div
      className="lw-overlay"
      ref={overlayRef}
    >
      <div className="lw-card">
        <div className="lw-title">Token Launch</div>

        {/* Progress dots */}
        <div className="lw-progress">
          {([1, 2, 3, 4] as Step[]).map((s, i) => (
            <div key={s} className="lw-progress-item">
              {i > 0 && (
                <div className={`lw-progress-line ${step > s - 1 ? 'filled' : ''}`} />
              )}
              <div
                className={[
                  'lw-progress-dot',
                  step === s ? 'active' : '',
                  step > s ? 'complete' : '',
                ].join(' ')}
                title={STEP_LABELS[s]}
              />
            </div>
          ))}
        </div>

        <div className="lw-step-label">{STEP_LABELS[step]}</div>
        <div className="lw-subtitle">{STEP_SUBTITLES[step]}</div>

        <div className="lw-content">
          {step === 1 && (
            <StepDetails s1={s1} setS1={setS1} onPickImage={handlePickImage} showErrors={hasAttemptedNext} />
          )}
          {step === 2 && (
            <StepConfig s2={s2} setS2={setS2} wallets={wallets} launchpads={launchpads} />
          )}
          {step === 3 && (
            <StepPreview
              s1={s1}
              s2={s2}
              launchpadName={selectedLaunchpad?.name ?? 'Pump.fun'}
              totalCost={totalCost}
              walletBalance={walletBalance}
              isBalanceLow={isBalanceLow}
              preflight={preflight}
              preflightLoading={preflightLoading}
              preflightError={preflightError}
              confirmed={confirmed}
              onToggleConfirm={() => setConfirmed((v) => !v)}
            />
          )}
          {step === 4 && (
            <StepExecuting
              phase={launchState.phase}
              result={launchState.result}
              error={launchState.error}
              activePhaseIdx={activePhaseIdx}
              launchpad={s2.launchpad}
              onRetry={handleRetry}
              onClose={closeLaunchWizard}
            />
          )}
        </div>

        {/* Footer */}
        {step < 4 && (
          <div className="lw-footer">
            <button className="lw-footer-close" onClick={closeLaunchWizard}>
              Cancel
            </button>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {step > 1 && (
                <button
                  className="lw-btn secondary"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                >
                  Back
                </button>
              )}

              {step < 3 && (
                <button
                  className="lw-btn primary"
                  disabled={step === 2 && !canProceedStep2}
                  onClick={() => {
                    if (step === 1) {
                      if (!canProceedStep1) {
                        setHasAttemptedNext(true)
                        return
                      }
                      setHasAttemptedNext(false)
                    }
                    setStep((s) => (s + 1) as Step)
                  }}
                >
                  Next
                </button>
              )}

              {step === 3 && (
                <button
                  className="lw-btn primary"
                  disabled={!confirmed || !launchChecksPassing || preflightLoading || isBalanceLow || selectedWalletMissingKeypair}
                  onClick={handleLaunch}
                >
                  Launch Token
                </button>
              )}
            </div>

            <span className="lw-step-counter">{step} / {TOTAL_STEPS}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step 1: Token Details ──────────────────────────────────────
function StepDetails({
  s1,
  setS1,
  onPickImage,
  showErrors,
}: {
  s1: Step1State
  setS1: React.Dispatch<React.SetStateAction<Step1State>>
  onPickImage: () => void
  showErrors: boolean
}) {
  const nameEmpty = s1.name.trim().length === 0
  const symbolEmpty = s1.symbol.trim().length === 0
  const descEmpty = s1.description.trim().length === 0

  return (
    <div>
      <div className="lw-field">
        <label className="lw-label">
          Token Name <span className="lw-label-required">*</span>
        </label>
        <input
          className={`lw-input ${showErrors && nameEmpty ? 'lw-input-error' : ''}`}
          value={s1.name}
          maxLength={32}
          placeholder="e.g. My Token"
          onChange={(e) => setS1((p) => ({ ...p, name: e.target.value }))}
        />
        {showErrors && nameEmpty && (
          <div className="lw-validation-error">Token name is required</div>
        )}
        <div className={`lw-char-count ${s1.name.length > 28 ? 'warn' : ''}`}>
          {s1.name.length} / 32
        </div>
      </div>

      <div className="lw-field">
        <label className="lw-label">
          Symbol / Ticker <span className="lw-label-required">*</span>
        </label>
        <input
          className={`lw-input ${showErrors && symbolEmpty ? 'lw-input-error' : ''}`}
          value={s1.symbol}
          maxLength={10}
          placeholder="e.g. MYTKN"
          onChange={(e) => setS1((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
        />
        {showErrors && symbolEmpty && (
          <div className="lw-validation-error">Symbol is required</div>
        )}
        <div className={`lw-char-count ${s1.symbol.length > 8 ? 'warn' : ''}`}>
          {s1.symbol.length} / 10
        </div>
      </div>

      <div className="lw-field">
        <label className="lw-label">
          Description <span className="lw-label-required">*</span>
        </label>
        <textarea
          className={`lw-textarea ${showErrors && descEmpty ? 'lw-textarea-error' : ''}`}
          value={s1.description}
          maxLength={300}
          placeholder="Describe your token..."
          onChange={(e) => setS1((p) => ({ ...p, description: e.target.value }))}
        />
        {showErrors && descEmpty && (
          <div className="lw-validation-error">Description is required</div>
        )}
        <div className={`lw-char-count ${s1.description.length > 260 ? 'warn' : ''}`}>
          {s1.description.length} / 300
        </div>
      </div>

      <div className="lw-field">
        <label className="lw-label">Token Image</label>
        <div className="lw-image-row">
          <div className="lw-image-preview">
            {s1.imagePreviewUrl ? (
              <img src={s1.imagePreviewUrl} alt="Token preview" />
            ) : (
              <svg className="lw-image-placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            )}
          </div>
          <div className="lw-image-actions">
            <button className="lw-btn secondary" onClick={onPickImage}>
              {s1.imagePath ? 'Change Image' : 'Select Image'}
            </button>
            {s1.imagePath && (
              <div className="lw-image-path" title={s1.imagePath}>
                {s1.imagePath.split(/[/\\]/).pop()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lw-divider" />

      <div className="lw-field">
        <label className="lw-label">
          Twitter URL <span className="lw-label-optional">optional</span>
        </label>
        <input
          className="lw-input"
          value={s1.twitter}
          placeholder="https://x.com/yourtoken"
          onChange={(e) => setS1((p) => ({ ...p, twitter: e.target.value }))}
        />
      </div>

      <div className="lw-field">
        <label className="lw-label">
          Telegram URL <span className="lw-label-optional">optional</span>
        </label>
        <input
          className="lw-input"
          value={s1.telegram}
          placeholder="https://t.me/yourtoken"
          onChange={(e) => setS1((p) => ({ ...p, telegram: e.target.value }))}
        />
      </div>

      <div className="lw-field">
        <label className="lw-label">
          Website URL <span className="lw-label-optional">optional</span>
        </label>
        <input
          className="lw-input"
          value={s1.website}
          placeholder="https://yourtoken.xyz"
          onChange={(e) => setS1((p) => ({ ...p, website: e.target.value }))}
        />
      </div>
    </div>
  )
}

// ── Step 2: Launch Config ──────────────────────────────────────
function StepConfig({
  s2,
  setS2,
  wallets,
  launchpads,
}: {
  s2: Step2State
  setS2: React.Dispatch<React.SetStateAction<Step2State>>
  wallets: LaunchWalletOption[]
  launchpads: LaunchpadDefinition[]
}) {
  const selectedWallet = wallets.find((wallet) => wallet.id === s2.walletId) ?? null

  return (
    <div>
      <div className="lw-field">
        <label className="lw-label">Launchpad</label>
        <div className="lw-launchpad-grid">
          {launchpads.map((launchpad) => {
            const selected = s2.launchpad === launchpad.id
            const classes = [
              'lw-launchpad-option',
              selected ? 'selected' : '',
              !launchpad.enabled ? 'disabled' : '',
            ].filter(Boolean).join(' ')

            return (
              <button
                key={launchpad.id}
                type="button"
                className={classes}
                disabled={!launchpad.enabled}
                onClick={() => setS2((prev) => ({ ...prev, launchpad: launchpad.id }))}
              >
                <div className="lw-launchpad-radio">
                  {selected && <div className="lw-launchpad-radio-dot" />}
                </div>
                <div className="lw-launchpad-info">
                  <div className="lw-launchpad-name">{launchpad.name}</div>
                  <div className="lw-launchpad-desc">{launchpad.description}</div>
                  {!launchpad.enabled && launchpad.reason && (
                    <div className="lw-launchpad-desc">{launchpad.reason}</div>
                  )}
                </div>
                {!launchpad.enabled && (
                  <div className="lw-launchpad-badge">Soon</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="lw-divider" />

      <div className="lw-field">
        <label className="lw-label">Signing Wallet</label>
        <select
          className="lw-input"
          value={s2.walletId}
          onChange={(e) => setS2((p) => ({ ...p, walletId: e.target.value }))}
          style={{ cursor: 'pointer' }}
        >
          {wallets.length === 0 && (
            <option value="">No wallets found</option>
          )}
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.isAssignedToActiveProject ? ' (Project)' : w.isDefault ? ' (Default)' : ''}
              {!w.hasKeypair ? ' (Watch-only)' : ''}
              {' — '}
              {w.address.slice(0, 6)}...{w.address.slice(-4)}
            </option>
          ))}
        </select>
        {selectedWallet && (
          <div className="lw-help-text">
            {selectedWallet.isAssignedToActiveProject
              ? 'This wallet is assigned to the active project.'
              : selectedWallet.isDefault
                ? 'This wallet is your default portfolio wallet.'
                : 'This wallet is available in your portfolio.'}
            {!selectedWallet.hasKeypair ? ' Import a keypair for this wallet before launching.' : ''}
          </div>
        )}
      </div>

      <div className="lw-num-row">
        <div className="lw-field">
          <label className="lw-label">Initial Buy (SOL)</label>
          <input
            className="lw-input"
            type="number"
            min="0"
            step="0.01"
            value={s2.initialBuySol}
            onChange={(e) => setS2((p) => ({ ...p, initialBuySol: e.target.value }))}
          />
        </div>

        <div className="lw-field">
          <label className="lw-label">Slippage %</label>
          <input
            className="lw-input"
            type="number"
            min="0.1"
            max="100"
            step="0.5"
            value={s2.slippage}
            onChange={(e) => setS2((p) => ({ ...p, slippage: e.target.value }))}
          />
        </div>

        <div className="lw-field">
          <label className="lw-label">Priority Fee (SOL)</label>
          <input
            className="lw-input"
            type="number"
            min="0"
            step="0.001"
            value={s2.priorityFee}
            onChange={(e) => setS2((p) => ({ ...p, priorityFee: e.target.value }))}
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Preview & Confirm ──────────────────────────────────
function StepPreview({
  s1,
  s2,
  launchpadName,
  totalCost,
  walletBalance,
  isBalanceLow,
  preflight,
  preflightLoading,
  preflightError,
  confirmed,
  onToggleConfirm,
}: {
  s1: Step1State
  s2: Step2State
  launchpadName: string
  totalCost: number
  walletBalance: number | null
  isBalanceLow: boolean
  preflight: TokenLaunchPreflight | null
  preflightLoading: boolean
  preflightError: string | null
  confirmed: boolean
  onToggleConfirm: () => void
}) {
  const s2Buy = parseFloat(s2.initialBuySol) || 0
  const s2Priority = parseFloat(s2.priorityFee) || 0

  return (
    <div>
      <div className="lw-summary">
        <div className="lw-summary-row">
          <span className="lw-summary-key">Name</span>
          <span className="lw-summary-val">{s1.name}</span>
        </div>
        <div className="lw-summary-row">
          <span className="lw-summary-key">Symbol</span>
          <span className="lw-summary-val">{s1.symbol.toUpperCase()}</span>
        </div>
        <div className="lw-summary-row">
          <span className="lw-summary-key">Description</span>
          <span className="lw-summary-val" style={{ whiteSpace: 'normal', fontSize: 11 }}>
            {s1.description}
          </span>
        </div>
        {s1.imagePath && (
          <div className="lw-summary-row">
            <span className="lw-summary-key">Image</span>
            <span className="lw-summary-val mono">{s1.imagePath.split(/[/\\]/).pop()}</span>
          </div>
        )}
        <div className="lw-summary-row">
          <span className="lw-summary-key">Launchpad</span>
          <span className="lw-summary-val">{launchpadName}</span>
        </div>
        <div className="lw-summary-row">
          <span className="lw-summary-key">Slippage</span>
          <span className="lw-summary-val mono">{s2.slippage}%</span>
        </div>
      </div>

      <div className="lw-cost-box">
        <div className="lw-cost-title">Estimated Cost</div>
        <div className="lw-cost-line">
          <span className="lw-cost-desc">Initial buy</span>
          <span className="lw-cost-amount">{s2Buy.toFixed(4)} SOL</span>
        </div>
        <div className="lw-cost-line">
          <span className="lw-cost-desc">Priority fee</span>
          <span className="lw-cost-amount">{s2Priority.toFixed(4)} SOL</span>
        </div>
        <div className="lw-cost-line">
          <span className="lw-cost-desc">Tx + rent</span>
          <span className="lw-cost-amount">~0.02 SOL</span>
        </div>
        <div className="lw-cost-line">
          <span className="lw-cost-desc" style={{ fontWeight: 600, color: 'var(--t1)' }}>Total</span>
          <span className="lw-cost-amount total">{totalCost.toFixed(4)} SOL</span>
        </div>
      </div>

      <div className="lw-balance-row">
        <span className="lw-balance-label">Wallet Balance</span>
        <span className="lw-balance-amount">
          {walletBalance === null ? 'Loading...' : `${walletBalance.toFixed(4)} SOL`}
        </span>
      </div>

      {isBalanceLow && (
        <div className="lw-warning">
          Insufficient balance. You need at least {totalCost.toFixed(4)} SOL but have {walletBalance?.toFixed(4)} SOL.
        </div>
      )}

      <div className="lw-cost-box">
        <div className="lw-cost-title">Launch Readiness</div>
        {preflightLoading && (
          <div className="lw-cost-line">
            <span className="lw-cost-desc">Checking launch requirements...</span>
          </div>
        )}
        {preflightError && (
          <div className="lw-warning" style={{ marginTop: 0 }}>
            {preflightError}
          </div>
        )}
        {preflight && preflight.checks.map((check) => (
          <div key={check.id} className="lw-cost-line" style={{ alignItems: 'flex-start' }}>
            <span className="lw-cost-desc">
              {check.label}
            </span>
            <span className={`lw-launch-check ${check.status}`}>
              {check.status}
            </span>
          </div>
        ))}
        {preflight && preflight.checks.map((check) => (
          <div key={`${check.id}-detail`} className="lw-summary-row">
            <span className="lw-summary-key" />
            <span className="lw-summary-val" style={{ whiteSpace: 'normal', fontSize: 11, color: 'var(--t3)' }}>
              {check.detail}
            </span>
          </div>
        ))}
      </div>

      <label className="lw-confirm-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={onToggleConfirm}
        />
        <span className="lw-confirm-text">
          I understand this action is irreversible and will deploy a token on-chain.
        </span>
      </label>
    </div>
  )
}

// ── Step 4: Executing ──────────────────────────────────────────
function StepExecuting({
  phase,
  result,
  error,
  activePhaseIdx,
  launchpad,
  onRetry,
  onClose,
}: {
  phase: string
  result: { mint: string; signature: string; success: boolean } | null
  error: string | null
  activePhaseIdx: number
  launchpad: LaunchpadId
  onRetry: () => void
  onClose: () => void
}) {
  const isDone = phase === 'done'
  const isError = phase === 'error'

  if (isDone && result) {
    return (
      <div className="lw-success">
        <div className="lw-success-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="lw-success-title">Token launched successfully</div>
        {result.signature && (
          <div className="lw-success-mint">
            Signature: {result.signature}
          </div>
        )}
        <div className="lw-btn-row" style={{ marginTop: 4 }}>
          <button
            className="lw-btn primary"
            onClick={() => openLaunchInBrowserMode(launchpad, result.mint)}
          >
            Open in Browser
          </button>
          <button
            className="lw-btn secondary"
            onClick={() => {
              if (result.signature) {
                window.daemon.shell.openExternal(`https://solscan.io/tx/${result.signature}`)
              }
            }}
          >
            View on Solscan
          </button>
          <button className="lw-btn secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="lw-executing">
        <div className="lw-error-box" style={{ width: '100%', textAlign: 'left' }}>
          {error ?? 'An unknown error occurred.'}
        </div>
        <div className="lw-btn-row">
          <button className="lw-btn secondary" onClick={onClose}>Dismiss</button>
          <button className="lw-btn danger" onClick={onRetry}>Try Again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="lw-executing">
      <div className="lw-spinner" />
      <div className="lw-phase-steps">
        {PHASE_STEPS.map((ps, i) => {
          const isDoneStep = i < activePhaseIdx
          const isActiveStep = i === activePhaseIdx
          return (
            <div
              key={ps.key}
              className={[
                'lw-phase-step',
                isActiveStep ? 'active' : '',
                isDoneStep ? 'done' : '',
              ].join(' ')}
            >
              <div className="lw-phase-dot" />
              {ps.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
