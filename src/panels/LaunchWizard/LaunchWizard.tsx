import { useState, useEffect, useMemo, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useNotificationsStore } from '../../store/notifications'
import { useTokenLaunch } from './useTokenLaunch'
import type { LaunchParams } from './useTokenLaunch'
import { getSolscanTxUrl } from '../../lib/solanaExplorer'
import { PanelHeader } from '../../components/Panel'
import basedbidLogo from '../../assets/basedbid-logo.svg'
import './LaunchWizard.css'

type Step = 1 | 2 | 3 | 4

const STEP_META: Record<1 | 2 | 3, { kicker: string; title: string; subtitle: string }> = {
  1: { kicker: 'Identity', title: 'Name your token', subtitle: 'How it shows up everywhere it lives' },
  2: { kicker: 'Configuration', title: 'Configure the launch', subtitle: 'Pick the path and tune the economics' },
  3: { kicker: 'Confirm', title: 'Review and launch', subtitle: 'One last look before you deploy on-chain' },
}

// ── State ─────────────────────────────────────────────────────
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

interface Step2State {
  launchpad: LaunchpadId
  initialBuySol: string
  slippage: string
  priorityFee: string
  walletId: string
  openbid: OpenBidState
}

type OpenBidPackageType = 'based' | 'super_based' | 'ultra_based'
type OpenBidDex = 'meteora' | 'raydium'

interface OpenBidState {
  chain: 'solana'
  packageType: OpenBidPackageType
  dex: OpenBidDex
  feeTier: string
  marketCap: string
  totalSupply: string
  maxAllocationPerUser: string
  initialBuyPercent: string
  saleStartTime: string
  softCap: string
  endTime: string
  referrer: string
  board: string
  boardOwner: string
  whitelist: string
  buyFeePercent: string
  sellFeePercent: string
  referralFeePercent: string
  graduationFeePercent: string
  dynamicFee: boolean
}

const OPENBID_MARKET_CAP_PRESETS = [
  ['11000', '$11K'],
  ['49000', '$49K'],
  ['99000', '$99K'],
  ['333000', '$333K'],
  ['999000', '$999K'],
  ['5000000', '$5M'],
  ['10000000', '$10M'],
] as const

const OPENBID_FEE_TIERS = [
  ['0', '1%'],
  ['1', '2%'],
  ['2', '4%'],
  ['3', '6%'],
] as const

const OPENBID_RAYDIUM_FEE_TIERS = OPENBID_FEE_TIERS.filter(([id]) => id !== '3')
const OPENBID_MAX_INITIAL_BUY_PERCENT = 80.2

const OPENBID_PLAN_META: Record<OpenBidPackageType, { title: string; detail: string; price: string }> = {
  based: { title: 'based', detail: 'Standard launch', price: '$0' },
  super_based: { title: 'super based', detail: 'Sale alert on socials', price: '$49' },
  ultra_based: { title: 'ultra based', detail: 'Sale alert & buy alerts on socials', price: '$99' },
}

function createDefaultOpenBidState(): OpenBidState {
  return {
    chain: 'solana',
    packageType: 'based',
    dex: 'meteora',
    feeTier: '1',
    marketCap: '11000',
    totalSupply: '1000000000',
    maxAllocationPerUser: '0',
    initialBuyPercent: '0.1',
    saleStartTime: '',
    softCap: '',
    endTime: '',
    referrer: '',
    board: '',
    boardOwner: '',
    whitelist: '',
    buyFeePercent: '0',
    sellFeePercent: '0',
    referralFeePercent: '0',
    graduationFeePercent: '0',
    dynamicFee: false,
  }
}

const PHASE_STEPS = [{ key: 'creating', label: 'Creating token launch' }] as const

function phaseIndex(phase: string): number {
  return PHASE_STEPS.findIndex((s) => s.key === phase)
}

function buildOpenBidConfig(state: OpenBidState): OpenBidLaunchInputConfig {
  return {
    chain: 'solana',
    packageType: state.packageType,
    dex: state.dex,
    feeTier: state.feeTier,
    marketCap: state.marketCap.trim(),
    totalSupply: state.totalSupply.trim(),
    maxAllocationPerUser: state.maxAllocationPerUser.trim(),
    initialBuyPercent: parseOptionalNumber(state.initialBuyPercent, 0),
    referrer: state.referrer.trim(),
    board: state.board.trim(),
    boardOwner: state.boardOwner.trim(),
    saleStartTime: parseDateTimeSeconds(state.saleStartTime),
    softCap: state.softCap.trim(),
    endTime: parseDateTimeSeconds(state.endTime),
    whitelistedAddresses: state.whitelist
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    buyFeePercent: parseOptionalNumber(state.buyFeePercent, 0),
    sellFeePercent: parseOptionalNumber(state.sellFeePercent, 0),
    referralFeePercent: parseOptionalNumber(state.referralFeePercent, 0),
    graduationFeePercent: parseOptionalNumber(state.graduationFeePercent, 0),
    dynamicFee: state.dynamicFee,
  }
}

function parseDateTimeSeconds(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function parseOptionalNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace('.0', '')}K`
  return `$${n}`
}

function getOpenBidFeeTiers(dex: OpenBidDex) {
  return dex === 'raydium' ? OPENBID_RAYDIUM_FEE_TIERS : OPENBID_FEE_TIERS
}

function getOpenBidFeeTierLabel(dex: OpenBidDex, feeTier: string): string {
  return getOpenBidFeeTiers(dex).find(([id]) => id === feeTier)?.[1] ?? '2%'
}

function isValidOpenBidInitialBuy(value: string): boolean {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= OPENBID_MAX_INITIAL_BUY_PERCENT
}

// ── Component ─────────────────────────────────────────────────
export function LaunchWizard() {
  const closeLaunchWizard = useWorkflowShellStore((s) => s.closeLaunchWizard)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectName = useUIStore((s) => (
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId)?.name ?? null : null
  ))
  const overlayRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [hasAttemptedNext, setHasAttemptedNext] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [wallets, setWallets] = useState<LaunchWalletOption[]>([])
  const [launchpads, setLaunchpads] = useState<LaunchpadDefinition[]>([])
  const [preflight, setPreflight] = useState<TokenLaunchPreflight | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [showSocials, setShowSocials] = useState(false)

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
    openbid: createDefaultOpenBidState(),
  })

  // Esc to close
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

  // Load wallets
  useEffect(() => {
    window.daemon.launch.listWalletOptions(activeProjectId).then((res) => {
      if (res.ok && res.data) {
        const list = res.data
        setWallets(list)
        if (list.length > 0 && !s2.walletId) {
          const preferred = list.find((w) => w.isAssignedToActiveProject && w.hasKeypair)
            ?? list.find((w) => w.isDefault && w.hasKeypair)
            ?? list.find((w) => w.hasKeypair)
            ?? list.find((w) => w.isAssignedToActiveProject)
            ?? list.find((w) => w.isDefault)
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
      if (active) setS2((prev) => ({ ...prev, launchpad: active.id }))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.daemon.settings.getWalletInfrastructureSettings().then((res) => {
      if (res.ok && res.data) setCluster(res.data.cluster)
    }).catch(() => {})
  }, [])

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
      const imgRes = await window.daemon.fs.readImageBase64(filePath)
      const previewUrl = imgRes.ok && imgRes.data ? imgRes.data.dataUrl : null
      setS1((prev) => ({ ...prev, imagePath: filePath, imagePreviewUrl: previewUrl }))
    }
  }

  const s2BuySol = parseFloat(s2.initialBuySol) || 0
  const s2Priority = parseFloat(s2.priorityFee) || 0
  const selectedWallet = wallets.find((w) => w.id === s2.walletId) ?? null
  const TX_BASE_COST = 0.02
  const isOpenBid = s2.launchpad === 'openbid'
  const totalCost = (isOpenBid ? 0 : s2BuySol) + s2Priority + TX_BASE_COST
  const isBalanceLow = walletBalance !== null && walletBalance < totalCost
  const selectedWalletMissingKeypair = selectedWallet ? !selectedWallet.hasKeypair : false
  const launchChecksPassing = preflight?.ready ?? false

  const selectedLaunchpad = launchpads.find((p) => p.id === s2.launchpad) ?? null

  const step1Missing = useMemo(() => {
    const m: string[] = []
    if (!s1.name.trim()) m.push('name')
    if (!s1.symbol.trim()) m.push('symbol')
    if (!s1.description.trim()) m.push('description')
    if (isOpenBid && !s1.imagePath) m.push('logo')
    return m
  }, [s1.name, s1.symbol, s1.description, s1.imagePath, isOpenBid])

  const canProceedStep1 = step1Missing.length === 0

  const canProceedStep2 = isOpenBid
    ? isValidOpenBidInitialBuy(s2.openbid.initialBuyPercent) &&
      s2Priority >= 0 &&
      s2.walletId.length > 0 &&
      !selectedWalletMissingKeypair
    : s2BuySol > 0 &&
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
      initialBuySol: isOpenBid ? 0 : s2BuySol,
      slippageBps: isOpenBid ? 0 : Math.round(parseFloat(s2.slippage) * 100),
      priorityFeeSol: s2Priority,
      walletId: s2.walletId,
      openbid: isOpenBid ? buildOpenBidConfig(s2.openbid) : undefined,
    }
    setStep(4)
    launch(params)
  }

  const upsertWallet = (wallet: LaunchWalletOption) => {
    setWallets((current) => {
      const exists = current.some((entry) => entry.id === wallet.id)
      return exists
        ? current.map((entry) => entry.id === wallet.id ? wallet : entry)
        : [wallet, ...current]
    })
  }

  const handleUseDaemonDeployer = async () => {
    const res = await window.daemon.launch.ensureDaemonDeployerWallet(activeProjectId)
    if (!res.ok || !res.data) {
      useNotificationsStore.getState().addActivity({
        kind: 'error',
        context: 'Runtime',
        message: res.error ?? 'Could not prepare DAEMON Deployer wallet',
        projectId: activeProjectId,
        projectName: activeProjectName,
      })
      return
    }
    upsertWallet(res.data)
    setS2((prev) => ({ ...prev, walletId: res.data!.id }))
    setPreflight(null)
    setConfirmed(false)
  }

  const handleImportSelectedWalletKeypair = async () => {
    if (!s2.walletId) return
    const res = await window.daemon.pumpfun.importKeypair(s2.walletId)
    if (!res.ok) return
    if (!res.data) return
    const walletsRes = await window.daemon.launch.listWalletOptions(activeProjectId)
    if (walletsRes.ok && walletsRes.data) {
      setWallets(walletsRes.data)
    } else {
      setWallets((current) => current.map((w) => (w.id === s2.walletId ? { ...w, hasKeypair: true } : w)))
    }
    setPreflight(null)
    setConfirmed(false)
  }

  const handleRetry = () => {
    reset()
    setStep(3)
    setConfirmed(false)
  }

  const activePhaseIdx = phaseIndex(launchState.phase)

  // Preflight on step 3
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
        initialBuySol: isOpenBid ? 0 : s2BuySol,
        slippageBps: isOpenBid ? 0 : Math.round(parseFloat(s2.slippage) * 100),
        priorityFeeSol: s2Priority,
        openbid: isOpenBid ? buildOpenBidConfig(s2.openbid) : undefined,
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
    return () => { cancelled = true }
  }, [step, s2.launchpad, s2.walletId, s2.initialBuySol, s2.openbid, s2.priorityFee, s2.slippage,
      s1.name, s1.symbol, s1.description, s1.imagePath, s1.twitter, s1.telegram, s1.website,
      activeProjectId, isOpenBid, s2BuySol, s2Priority])

  // ── Status line text for the commit bar ──
  const statusLine = (() => {
    if (step === 1) {
      if (step1Missing.length === 0) return { kind: 'ready' as const, text: `Ready · $${s1.symbol.toUpperCase() || 'TOKEN'}` }
      return { kind: 'pending' as const, text: `${step1Missing.length} ${step1Missing.length === 1 ? 'field' : 'fields'} remaining` }
    }
    if (step === 2) {
      if (canProceedStep2) return { kind: 'ready' as const, text: `Ready to review` }
      if (!s2.walletId) return { kind: 'pending' as const, text: 'Pick a wallet' }
      if (selectedWalletMissingKeypair) return { kind: 'pending' as const, text: 'Import wallet keypair' }
      return { kind: 'pending' as const, text: 'Fill required config' }
    }
    if (step === 3) {
      if (preflightLoading) return { kind: 'pending' as const, text: 'Running preflight…' }
      if (isBalanceLow) return { kind: 'error' as const, text: 'Insufficient balance' }
      if (!launchChecksPassing) return { kind: 'pending' as const, text: 'Preflight checks pending' }
      if (!confirmed) return { kind: 'pending' as const, text: 'Confirm to launch' }
      return { kind: 'ready' as const, text: `Ready · ${totalCost.toFixed(4)} SOL` }
    }
    return null
  })()

  const primaryDisabled = (() => {
    if (step === 1) return !canProceedStep1 && hasAttemptedNext === true ? false : !canProceedStep1
    if (step === 2) return !canProceedStep2
    if (step === 3) return !confirmed || !launchChecksPassing || preflightLoading || isBalanceLow || selectedWalletMissingKeypair
    return true
  })()

  const handlePrimary = () => {
    if (step === 1) {
      if (!canProceedStep1) {
        setHasAttemptedNext(true)
        return
      }
      setHasAttemptedNext(false)
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(3)
      return
    }
    if (step === 3) {
      handleLaunch()
    }
  }

  const previewSymbol = (s1.symbol.trim() || 'TKN').toUpperCase()
  const previewAvatarChar = previewSymbol.charAt(0)
  const previewName = s1.name.trim() || 'Your Token'
  const headerTitle = step <= 3 ? STEP_META[step as 1 | 2 | 3].title : 'Launch in progress'
  const headerSubtitle = step <= 3
    ? STEP_META[step as 1 | 2 | 3].subtitle
    : 'Broadcasting, verifying, and writing the launch result.'

  return (
    <div className="lw-overlay" ref={overlayRef}>
      <div className="lw-modal">
        <PanelHeader
          className="lw-header"
          kicker="Token Launch"
          brandKicker
          title={headerTitle}
          subtitle={headerSubtitle}
          actions={
            <button type="button" className="lw-close" onClick={closeLaunchWizard} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          }
        />

        {/* ── Stepper ── */}
        {step <= 3 && (
          <nav className="lw-stepper" aria-label="Launch progress">
            {([1, 2, 3] as const).map((n) => {
              const state = step > n ? 'complete' : step === n ? 'active' : 'pending'
              return (
                <div key={n} className={`lw-step ${state}`}>
                  <div className="lw-step-dot">
                    {state === 'complete' ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span>{n}</span>
                    )}
                  </div>
                  <span className="lw-step-label">{STEP_META[n].kicker}</span>
                </div>
              )
            })}
          </nav>
        )}

        {/* ── Body ── */}
        <div className="lw-body">
          {step <= 3 && (
            <>
              <div className="lw-main">
                {step === 1 && (
                  <StepIdentity
                    s1={s1}
                    setS1={setS1}
                    onPickImage={handlePickImage}
                    showErrors={hasAttemptedNext}
                    showSocials={showSocials}
                    onToggleSocials={() => setShowSocials((v) => !v)}
                  />
                )}
                {step === 2 && (
                  <StepConfig
                    s2={s2}
                    setS2={setS2}
                    s1={s1}
                    wallets={wallets}
                    launchpads={launchpads}
                    isOpenBid={isOpenBid}
                    onUseDaemonDeployer={handleUseDaemonDeployer}
                    onImportSelectedWalletKeypair={handleImportSelectedWalletKeypair}
                  />
                )}
                {step === 3 && (
                  <StepConfirm
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
              </div>

              <aside className="lw-rail">
                <LivePreviewCard
                  name={previewName}
                  symbol={previewSymbol}
                  avatarChar={previewAvatarChar}
                  imagePreviewUrl={s1.imagePreviewUrl}
                  launchpadName={selectedLaunchpad?.name ?? '—'}
                  isOpenBid={isOpenBid}
                  marketCap={s2.openbid.marketCap}
                  feeTierLabel={getOpenBidFeeTierLabel(s2.openbid.dex, s2.openbid.feeTier)}
                  planTitle={OPENBID_PLAN_META[s2.openbid.packageType].title}
                  initialBuyPercent={s2.openbid.initialBuyPercent}
                  initialBuySol={s2BuySol}
                  totalCost={totalCost}
                  step={step}
                  step1Missing={step1Missing}
                />
              </aside>
            </>
          )}

          {step === 4 && (
            <div className="lw-takeover">
              <StepExecuting
                phase={launchState.phase}
                result={launchState.result}
                error={launchState.error}
                activePhaseIdx={activePhaseIdx}
                cluster={cluster}
                onRetry={handleRetry}
                onClose={closeLaunchWizard}
              />
            </div>
          )}
        </div>

        {/* ── Commit bar ── */}
        {step <= 3 && (
          <footer className="lw-commit">
            <button type="button" className="lw-ghost" onClick={closeLaunchWizard}>
              Cancel
            </button>

            {statusLine && (
              <div className={`lw-status ${statusLine.kind}`}>
                <span className="lw-status-dot" />
                {statusLine.text}
              </div>
            )}

            <div className="lw-commit-actions">
              {step > 1 && (
                <button type="button" className="lw-btn-secondary" onClick={() => setStep((s) => (s - 1) as Step)}>
                  Back
                </button>
              )}
              <button
                type="button"
                className="lw-btn-primary"
                disabled={primaryDisabled}
                onClick={handlePrimary}
              >
                {step === 3 ? `Launch $${previewSymbol}` : 'Continue'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

// ── Live Preview Card ─────────────────────────────────────────
function LivePreviewCard({
  name,
  symbol,
  avatarChar,
  imagePreviewUrl,
  launchpadName,
  isOpenBid,
  marketCap,
  feeTierLabel,
  planTitle,
  initialBuyPercent,
  initialBuySol,
  totalCost,
  step,
  step1Missing,
}: {
  name: string
  symbol: string
  avatarChar: string
  imagePreviewUrl: string | null
  launchpadName: string
  isOpenBid: boolean
  marketCap: string
  feeTierLabel: string
  planTitle: string
  initialBuyPercent: string
  initialBuySol: number
  totalCost: number
  step: Step
  step1Missing: string[]
}) {
  return (
    <div className="lw-preview">
      <div className="lw-preview-head">
        {isOpenBid
          ? <img className="lw-preview-brand" src={basedbidLogo} alt="basedbid" />
          : <span className="lw-preview-eyebrow">Live Preview</span>}
        <span className="lw-preview-pill">{launchpadName}</span>
      </div>

      <div className="lw-preview-card">
        <div className="lw-preview-glow" />
        <div className="lw-preview-row">
          <div className="lw-preview-avatar">
            {imagePreviewUrl
              ? <img src={imagePreviewUrl} alt="" />
              : <span>{avatarChar}</span>}
          </div>
          <div className="lw-preview-id">
            <div className="lw-preview-name">{name}</div>
            <div className="lw-preview-ticker">${symbol}</div>
          </div>
        </div>

        <div className="lw-preview-stats">
          <div>
            <span>Market cap</span>
            <strong>{isOpenBid ? formatCompact(Number(marketCap) || 0) : '—'}</strong>
          </div>
          <div>
            <span>Plan</span>
            <strong>{isOpenBid ? planTitle : 'standard'}</strong>
          </div>
          <div>
            <span>Initial buy</span>
            <strong>{isOpenBid ? `${initialBuyPercent || '0'}%` : `${initialBuySol.toFixed(2)} SOL`}</strong>
          </div>
          <div>
            <span>DEX fee</span>
            <strong>{isOpenBid ? feeTierLabel : '—'}</strong>
          </div>
        </div>

        {step === 3 && (
          <div className="lw-preview-total">
            <span>Estimated cost</span>
            <strong>{totalCost.toFixed(4)} SOL</strong>
          </div>
        )}

        <div className={`lw-preview-status ${step1Missing.length === 0 ? 'ready' : 'pending'}`}>
          <span className="lw-preview-status-dot" />
          {step1Missing.length === 0
            ? 'Ready to launch'
            : `Missing: ${step1Missing.join(', ')}`}
        </div>
      </div>

      <p className="lw-preview-help">
        {step === 1 && 'Fill in identity and the preview locks in.'}
        {step === 2 && 'Tune economics and watch market cap, plan, and fees update here.'}
        {step === 3 && 'This is what gets broadcast on-chain.'}
      </p>
    </div>
  )
}

// ── Step 1: Identity ──────────────────────────────────────────
function StepIdentity({
  s1,
  setS1,
  onPickImage,
  showErrors,
  showSocials,
  onToggleSocials,
}: {
  s1: Step1State
  setS1: React.Dispatch<React.SetStateAction<Step1State>>
  onPickImage: () => void
  showErrors: boolean
  showSocials: boolean
  onToggleSocials: () => void
}) {
  const nameEmpty = s1.name.trim().length === 0
  const symbolEmpty = s1.symbol.trim().length === 0
  const descEmpty = s1.description.trim().length === 0

  return (
    <div className="lw-step-body">
      <Field label="Token name" required hint="Up to 32 characters" error={showErrors && nameEmpty ? 'Required' : undefined}>
        <input
          className="lw-input"
          value={s1.name}
          maxLength={32}
          placeholder="e.g. Memecoin Energy"
          onChange={(e) => setS1((p) => ({ ...p, name: e.target.value }))}
        />
        <CharCount value={s1.name.length} max={32} />
      </Field>

      <Field label="Ticker" required hint="3-10 characters, auto-uppercased" error={showErrors && symbolEmpty ? 'Required' : undefined}>
        <input
          className="lw-input mono"
          value={s1.symbol}
          maxLength={10}
          placeholder="MEME"
          onChange={(e) => setS1((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
        />
        <CharCount value={s1.symbol.length} max={10} />
      </Field>

      <Field label="Description" required hint="What this token is about" error={showErrors && descEmpty ? 'Required' : undefined}>
        <textarea
          className="lw-textarea"
          value={s1.description}
          maxLength={300}
          placeholder="One or two sentences. Keep it tight."
          onChange={(e) => setS1((p) => ({ ...p, description: e.target.value }))}
        />
        <CharCount value={s1.description.length} max={300} />
      </Field>

      <Field label="Token logo" hint="Square image, transparent PNG works best">
        <div className="lw-dropzone">
          <div className="lw-dropzone-thumb">
            {s1.imagePreviewUrl ? (
              <img src={s1.imagePreviewUrl} alt="" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            )}
          </div>
          <div className="lw-dropzone-meta">
            <div className="lw-dropzone-title">
              {s1.imagePath ? s1.imagePath.split(/[/\\]/).pop() : 'No image yet'}
            </div>
            <div className="lw-dropzone-hint">
              {s1.imagePath ? 'Replace any time' : 'PNG, JPG, GIF up to 5MB'}
            </div>
          </div>
          <button type="button" className="lw-btn-secondary" onClick={onPickImage}>
            {s1.imagePath ? 'Replace' : 'Upload'}
          </button>
        </div>
      </Field>

      <button type="button" className="lw-disclosure" onClick={onToggleSocials} aria-expanded={showSocials}>
        <svg className={`lw-disclosure-chevron ${showSocials ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Socials
        <span className="lw-disclosure-meta">{[s1.twitter, s1.telegram, s1.website].filter(Boolean).length || 'none'} set</span>
      </button>

      {showSocials && (
        <div className="lw-disclosure-body">
          <Field label="Twitter" hint="optional">
            <input className="lw-input" value={s1.twitter} placeholder="https://x.com/yourtoken"
                   onChange={(e) => setS1((p) => ({ ...p, twitter: e.target.value }))} />
          </Field>
          <Field label="Telegram" hint="optional">
            <input className="lw-input" value={s1.telegram} placeholder="https://t.me/yourtoken"
                   onChange={(e) => setS1((p) => ({ ...p, telegram: e.target.value }))} />
          </Field>
          <Field label="Website" hint="optional">
            <input className="lw-input" value={s1.website} placeholder="https://yourtoken.xyz"
                   onChange={(e) => setS1((p) => ({ ...p, website: e.target.value }))} />
          </Field>
        </div>
      )}
    </div>
  )
}

// ── Step 2: Config ────────────────────────────────────────────
function StepConfig({
  s2,
  setS2,
  s1,
  wallets,
  launchpads,
  isOpenBid,
  onUseDaemonDeployer,
  onImportSelectedWalletKeypair,
}: {
  s2: Step2State
  setS2: React.Dispatch<React.SetStateAction<Step2State>>
  s1: Step1State
  wallets: LaunchWalletOption[]
  launchpads: LaunchpadDefinition[]
  isOpenBid: boolean
  onUseDaemonDeployer: () => void
  onImportSelectedWalletKeypair: () => void
}) {
  const selectedWallet = wallets.find((w) => w.id === s2.walletId) ?? null
  const daemonDeployer = wallets.find((w) => w.ecosystemRole === 'daemon-deployer') ?? null
  const selectedDaemonDeployer = selectedWallet?.ecosystemRole === 'daemon-deployer'

  const liveLaunchpads = launchpads.filter((p) => p.enabled)
  const soonLaunchpads = launchpads.filter((p) => !p.enabled)
  const [showSoon, setShowSoon] = useState(false)

  return (
    <div className="lw-step-body">
      <Section title="Launchpad" subtitle="Where this token will deploy.">
        <div className="lw-pads">
          {liveLaunchpads.map((pad) => {
            const selected = s2.launchpad === pad.id
            return (
              <button
                key={pad.id}
                type="button"
                className={`lw-pad ${selected ? 'selected' : ''}`}
                onClick={() => setS2((prev) => ({ ...prev, launchpad: pad.id }))}
              >
                {pad.id === 'openbid'
                  ? <img className="lw-pad-brand" src={basedbidLogo} alt="" />
                  : <div className="lw-pad-dot" />}
                <div className="lw-pad-body">
                  <div className="lw-pad-name">
                    {pad.name}
                    <span className="lw-pad-live">Live</span>
                  </div>
                  <div className="lw-pad-desc">{pad.description}</div>
                </div>
              </button>
            )
          })}
        </div>

        {soonLaunchpads.length > 0 && (
          <>
            <button type="button" className="lw-disclosure" onClick={() => setShowSoon((v) => !v)} aria-expanded={showSoon}>
              <svg className={`lw-disclosure-chevron ${showSoon ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              More launchpads
              <span className="lw-disclosure-meta">{soonLaunchpads.length} coming soon</span>
            </button>
            {showSoon && (
              <div className="lw-pads dim">
                {soonLaunchpads.map((pad) => (
                  <div key={pad.id} className="lw-pad disabled">
                    <div className="lw-pad-dot" />
                    <div className="lw-pad-body">
                      <div className="lw-pad-name">
                        {pad.name}
                        <span className="lw-pad-soon">Soon</span>
                      </div>
                      <div className="lw-pad-desc">{pad.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {isOpenBid && (
        <Section title="basedbid pool" subtitle="LBP economics on Solana." accent>
          <Field label="Chain">
            <Segmented
              options={[
                { value: 'sol', label: 'SOL', active: true },
                { value: 'base', label: 'Base', disabled: true },
                { value: 'more', label: 'More', disabled: true },
              ]}
              value="sol"
              onChange={() => {}}
            />
          </Field>

          <Field label="Market cap target" hint="$11K to $10M">
            <input
              className="lw-input mono"
              value={s2.openbid.marketCap}
              onChange={(e) => setS2((prev) => ({ ...prev, openbid: { ...prev.openbid, marketCap: e.target.value } }))}
            />
            <div className="lw-chips">
              {OPENBID_MARKET_CAP_PRESETS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`lw-chip ${s2.openbid.marketCap === value ? 'active' : ''}`}
                  onClick={() => setS2((prev) => ({ ...prev, openbid: { ...prev.openbid, marketCap: value } }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Initial buy" hint="% of supply">
            <input
              className="lw-input mono"
              type="number"
              min="0"
              max={OPENBID_MAX_INITIAL_BUY_PERCENT}
              step="0.1"
              value={s2.openbid.initialBuyPercent}
              onChange={(e) => setS2((prev) => ({ ...prev, openbid: { ...prev.openbid, initialBuyPercent: e.target.value } }))}
            />
          </Field>

          <div className="lw-grid-2">
            <Field label="DEX">
              <Segmented
                options={[
                  { value: 'meteora', label: 'Meteora' },
                  { value: 'raydium', label: 'Raydium' },
                ]}
                value={s2.openbid.dex}
                onChange={(v) => setS2((prev) => ({
                  ...prev,
                  openbid: {
                    ...prev.openbid,
                    dex: v as OpenBidDex,
                    feeTier: v === 'raydium' && prev.openbid.feeTier === '3' ? '2' : prev.openbid.feeTier,
                  },
                }))}
              />
            </Field>
            <Field label="DEX fees">
              <Segmented
                options={getOpenBidFeeTiers(s2.openbid.dex).map(([id, label]) => ({ value: id, label }))}
                value={s2.openbid.feeTier}
                onChange={(v) => setS2((prev) => ({ ...prev, openbid: { ...prev.openbid, feeTier: v } }))}
              />
            </Field>
          </div>

          <Field label="Launch plan">
            <div className="lw-plans">
              {(Object.keys(OPENBID_PLAN_META) as OpenBidPackageType[]).map((plan) => {
                const meta = OPENBID_PLAN_META[plan]
                const active = s2.openbid.packageType === plan
                return (
                  <button
                    key={plan}
                    type="button"
                    className={`lw-plan ${active ? 'active' : ''}`}
                    onClick={() => setS2((prev) => ({ ...prev, openbid: { ...prev.openbid, packageType: plan } }))}
                  >
                    <div className="lw-plan-name">{meta.title}</div>
                    <div className="lw-plan-detail">{meta.detail}</div>
                    <div className="lw-plan-price">{meta.price}</div>
                  </button>
                )
              })}
            </div>
          </Field>

          <details className="lw-advanced">
            <summary>
              <svg className="lw-disclosure-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Advanced LBP settings
              <span className="lw-disclosure-meta">Supply, fees, whitelist, schedule</span>
            </summary>
            <div className="lw-advanced-body">
              <div className="lw-grid-2">
                <Field label="Total supply"><input className="lw-input mono" value={s2.openbid.totalSupply}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, totalSupply: e.target.value } }))} /></Field>
                <Field label="Single buyer limit"><input className="lw-input mono" value={s2.openbid.maxAllocationPerUser}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, maxAllocationPerUser: e.target.value } }))} /></Field>
              </div>
              <div className="lw-grid-2">
                <Field label="Sale start"><input className="lw-input" type="datetime-local" value={s2.openbid.saleStartTime}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, saleStartTime: e.target.value } }))} /></Field>
                <Field label="Soft cap end"><input className="lw-input" type="datetime-local" value={s2.openbid.endTime}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, endTime: e.target.value } }))} /></Field>
              </div>
              <div className="lw-grid-3">
                <Field label="Buy fee %"><input className="lw-input mono" type="number" min="0" max="1" step="0.1" value={s2.openbid.buyFeePercent}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, buyFeePercent: e.target.value } }))} /></Field>
                <Field label="Sell fee %"><input className="lw-input mono" type="number" min="0" max="1" step="0.1" value={s2.openbid.sellFeePercent}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, sellFeePercent: e.target.value } }))} /></Field>
                <Field label="Graduation fee %"><input className="lw-input mono" type="number" min="0" max="2.5" step="0.1" value={s2.openbid.graduationFeePercent}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, graduationFeePercent: e.target.value } }))} /></Field>
              </div>
              <div className="lw-grid-2">
                <Field label="Referrer wallet"><input className="lw-input mono" value={s2.openbid.referrer} placeholder="optional"
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, referrer: e.target.value } }))} /></Field>
                <Field label="Referral fee %"><input className="lw-input mono" type="number" min="0" max="1" step="0.1" value={s2.openbid.referralFeePercent}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, referralFeePercent: e.target.value } }))} /></Field>
              </div>
              <label className="lw-toggle-row">
                <input type="checkbox" checked={s2.openbid.dynamicFee}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, dynamicFee: e.target.checked } }))} />
                <span>
                  <strong>Dynamic fee</strong>
                  <small>Curve the fee schedule over the sale window.</small>
                </span>
              </label>
              <Field label="Whitelist" hint="One address per line or comma-separated">
                <textarea className="lw-textarea mono" value={s2.openbid.whitelist}
                  onChange={(e) => setS2((p) => ({ ...p, openbid: { ...p.openbid, whitelist: e.target.value } }))} />
              </Field>
            </div>
          </details>
        </Section>
      )}

      <Section title="Signing wallet" subtitle="The wallet that deploys and pays gas.">
        <div className={`lw-wallet-card ${selectedDaemonDeployer ? 'active' : ''}`}>
          <div className="lw-wallet-info">
            <div className="lw-wallet-title">DAEMON Deployer</div>
            <div className="lw-wallet-addr">8A4i2yk8R9ivCGdtQeyo71JYyB6CjfSsMnWcYthisPwT</div>
            <div className={`lw-wallet-status ${daemonDeployer?.hasKeypair ? 'ready' : 'pending'}`}>
              <span className="lw-status-dot" />
              {daemonDeployer
                ? daemonDeployer.hasKeypair ? 'Signer ready' : 'Keypair required'
                : 'Not added yet'}
            </div>
          </div>
          <div className="lw-wallet-actions">
            <button type="button" className="lw-btn-secondary" onClick={onUseDaemonDeployer}>
              {selectedDaemonDeployer ? 'Selected' : 'Use Deployer'}
            </button>
            {selectedDaemonDeployer && !selectedWallet?.hasKeypair && (
              <button type="button" className="lw-btn-secondary" onClick={onImportSelectedWalletKeypair}>
                Import Keypair
              </button>
            )}
          </div>
        </div>

        <Field label="Or pick another wallet">
          <select
            className="lw-input"
            value={s2.walletId}
            onChange={(e) => setS2((p) => ({ ...p, walletId: e.target.value }))}
          >
            {wallets.length === 0 && <option value="">No wallets found</option>}
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.ecosystemRole === 'daemon-deployer' ? ' (Deployer)' : ''}
                {w.isAssignedToActiveProject ? ' · project' : w.isDefault ? ' · default' : ''}
                {!w.hasKeypair ? ' · watch-only' : ''}
                {' — '}{w.address.slice(0, 4)}…{w.address.slice(-4)}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {!isOpenBid && (
        <Section title="Economics" subtitle="Buy-in, slippage, priority fee.">
          <div className="lw-grid-3">
            <Field label="Initial buy" hint="SOL">
              <input className="lw-input mono" type="number" min="0" step="0.01" value={s2.initialBuySol}
                onChange={(e) => setS2((p) => ({ ...p, initialBuySol: e.target.value }))} />
            </Field>
            <Field label="Slippage" hint="%">
              <input className="lw-input mono" type="number" min="0.1" max="100" step="0.5" value={s2.slippage}
                onChange={(e) => setS2((p) => ({ ...p, slippage: e.target.value }))} />
            </Field>
            <Field label="Priority fee" hint="SOL">
              <input className="lw-input mono" type="number" min="0" step="0.001" value={s2.priorityFee}
                onChange={(e) => setS2((p) => ({ ...p, priorityFee: e.target.value }))} />
            </Field>
          </div>
        </Section>
      )}

      {isOpenBid && (
        <Section title="Economics" subtitle="Transaction priority.">
          <Field label="Priority fee" hint="SOL">
            <input className="lw-input mono" type="number" min="0" step="0.001" value={s2.priorityFee}
              onChange={(e) => setS2((p) => ({ ...p, priorityFee: e.target.value }))} />
          </Field>
        </Section>
      )}
    </div>
  )
}

// ── Step 3: Confirm ───────────────────────────────────────────
function StepConfirm({
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
  const isOpenBid = s2.launchpad === 'openbid'
  const s2Buy = isOpenBid ? 0 : parseFloat(s2.initialBuySol) || 0
  const s2Priority = parseFloat(s2.priorityFee) || 0

  return (
    <div className="lw-step-body">
      <Section title="Summary" subtitle="The exact values that will be broadcast.">
        <dl className="lw-summary">
          <SummaryRow k="Token" v={`${s1.name} · $${s1.symbol.toUpperCase()}`} />
          <SummaryRow k="Description" v={s1.description} wrap />
          {s1.imagePath && <SummaryRow k="Image" v={s1.imagePath.split(/[/\\]/).pop() ?? ''} mono />}
          <SummaryRow k="Launchpad" v={launchpadName} />
          {isOpenBid
            ? <SummaryRow k="Initial buy" v={`${s2.openbid.initialBuyPercent || '0'}% of supply`} mono />
            : <SummaryRow k="Slippage" v={`${s2.slippage}%`} mono />}
        </dl>
      </Section>

      <Section title="Cost" subtitle="Estimated SOL needed for this launch.">
        <div className="lw-cost">
          {!isOpenBid && <CostLine label="Initial buy" value={`${s2Buy.toFixed(4)} SOL`} />}
          <CostLine label="Priority fee" value={`${s2Priority.toFixed(4)} SOL`} />
          <CostLine label="Tx + rent" value="~0.0200 SOL" />
          <div className="lw-cost-total">
            <span>Total</span>
            <strong>{totalCost.toFixed(4)} SOL</strong>
          </div>
          <div className={`lw-cost-balance ${isBalanceLow ? 'low' : ''}`}>
            <span>Wallet balance</span>
            <strong>{walletBalance === null ? 'Loading…' : `${walletBalance.toFixed(4)} SOL`}</strong>
          </div>
        </div>
        {isBalanceLow && walletBalance !== null && (
          <div className="lw-banner error">
            Insufficient balance. Need {totalCost.toFixed(4)} SOL, have {walletBalance.toFixed(4)} SOL.
          </div>
        )}
      </Section>

      <Section title="Preflight" subtitle="On-chain readiness checks.">
        {preflightLoading && <div className="lw-preflight-row loading"><span /> Running checks…</div>}
        {preflightError && <div className="lw-banner error">{preflightError}</div>}
        {preflight && preflight.checks.map((check) => (
          <div key={check.id} className="lw-preflight-row">
            <div className="lw-preflight-text">
              <div className="lw-preflight-label">{check.label}</div>
              <div className="lw-preflight-detail">{check.detail}</div>
            </div>
            <span className={`lw-preflight-pill ${check.status}`}>{check.status}</span>
          </div>
        ))}
      </Section>

      <label className={`lw-confirm ${confirmed ? 'checked' : ''}`}>
        <input type="checkbox" checked={confirmed} onChange={onToggleConfirm} />
        <span>
          <strong>I understand this is irreversible.</strong>
          <small>The token will be deployed on-chain. Costs are estimates and may vary with network conditions.</small>
        </span>
      </label>
    </div>
  )
}

// ── Step 4: Executing / Success / Error ───────────────────────
function StepExecuting({
  phase,
  result,
  error,
  activePhaseIdx,
  cluster,
  onRetry,
  onClose,
}: {
  phase: string
  result: { mint: string; signature: string; success: boolean } | null
  error: string | null
  activePhaseIdx: number
  cluster: WalletInfrastructureSettings['cluster']
  onRetry: () => void
  onClose: () => void
}) {
  const isDone = phase === 'done'
  const isError = phase === 'error'

  if (isDone && result) {
    return (
      <div className="lw-finale success">
        <div className="lw-finale-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2>Token launched</h2>
        {result.signature && (
          <code className="lw-finale-sig">{result.signature}</code>
        )}
        <div className="lw-finale-actions">
          {result.signature && (
            <button type="button" className="lw-btn-secondary" onClick={() => window.daemon.shell.openExternal(getSolscanTxUrl(result.signature, cluster))}>
              View on Solscan
            </button>
          )}
          <button type="button" className="lw-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="lw-finale error">
        <div className="lw-finale-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h2>Launch failed</h2>
        <p className="lw-finale-msg">{error ?? 'An unknown error occurred.'}</p>
        <div className="lw-finale-actions">
          <button type="button" className="lw-btn-secondary" onClick={onClose}>Dismiss</button>
          <button type="button" className="lw-btn-primary" onClick={onRetry}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="lw-finale loading">
      <div className="lw-finale-spinner" />
      <h2>Broadcasting to the network</h2>
      <div className="lw-finale-phases">
        {PHASE_STEPS.map((ps, i) => {
          const isDoneStep = i < activePhaseIdx
          const isActiveStep = i === activePhaseIdx
          return (
            <div key={ps.key} className={`lw-finale-phase ${isActiveStep ? 'active' : ''} ${isDoneStep ? 'done' : ''}`}>
              <span className="lw-finale-phase-dot" />
              {ps.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Primitives ────────────────────────────────────────────────
function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className={`lw-field ${error ? 'has-error' : ''}`}>
      <div className="lw-field-head">
        <span className="lw-field-label">
          {label}
          {required && <span className="lw-field-req">*</span>}
        </span>
        {hint && <span className="lw-field-hint">{hint}</span>}
      </div>
      <div className="lw-field-control">{children}</div>
      {error && <div className="lw-field-error">{error}</div>}
    </div>
  )
}

function CharCount({ value, max }: { value: number; max: number }) {
  const warn = value > max * 0.86
  return <div className={`lw-count ${warn ? 'warn' : ''}`}>{value}/{max}</div>
}

function Section({ title, subtitle, accent, children }: { title: string; subtitle?: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <section className={`lw-section ${accent ? 'accent' : ''}`}>
      <header className="lw-section-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="lw-section-body">{children}</div>
    </section>
  )
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string; disabled?: boolean; active?: boolean }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="lw-seg" role="radiogroup">
      {options.map((opt) => {
        const isActive = opt.active ?? value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={opt.disabled}
            className={`lw-seg-opt ${isActive ? 'active' : ''}`}
            onClick={() => !opt.disabled && onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SummaryRow({ k, v, mono, wrap }: { k: string; v: string; mono?: boolean; wrap?: boolean }) {
  return (
    <div className="lw-summary-row">
      <dt>{k}</dt>
      <dd className={`${mono ? 'mono' : ''} ${wrap ? 'wrap' : ''}`}>{v}</dd>
    </div>
  )
}

function CostLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="lw-cost-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
