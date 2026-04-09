import { useEffect, useState } from 'react'

interface RuntimeStackState {
  settings: WalletInfrastructureSettings | null
  heliusConfigured: boolean
  jupiterConfigured: boolean
}

const DEFAULT_SETTINGS: WalletInfrastructureSettings = {
  rpcProvider: 'helius',
  quicknodeRpcUrl: '',
  customRpcUrl: '',
  swapProvider: 'jupiter',
  preferredWallet: 'phantom',
  executionMode: 'rpc',
  jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
}

export function RuntimeStackSection() {
  const [state, setState] = useState<RuntimeStackState>({
    settings: null,
    heliusConfigured: false,
    jupiterConfigured: false,
  })

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      window.daemon.settings.getWalletInfrastructureSettings(),
      window.daemon.wallet.hasHeliusKey(),
      window.daemon.wallet.hasJupiterKey(),
    ]).then(([settingsRes, heliusRes, jupiterRes]) => {
      if (cancelled) return
      setState({
        settings: settingsRes.ok && settingsRes.data ? settingsRes.data : DEFAULT_SETTINGS,
        heliusConfigured: heliusRes.ok && heliusRes.data === true,
        jupiterConfigured: jupiterRes.ok && jupiterRes.data === true,
      })
    }).catch(() => {
      if (cancelled) return
      setState({
        settings: DEFAULT_SETTINGS,
        heliusConfigured: false,
        jupiterConfigured: false,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const settings = state.settings ?? DEFAULT_SETTINGS
  const rpcLabel = settings.rpcProvider === 'quicknode'
    ? 'QuickNode'
    : settings.rpcProvider === 'custom'
      ? 'Custom RPC'
      : settings.rpcProvider === 'public'
        ? 'Public RPC'
        : 'Helius'

  const rpcDetail = settings.rpcProvider === 'quicknode'
    ? settings.quicknodeRpcUrl || 'QuickNode endpoint not set'
    : settings.rpcProvider === 'custom'
      ? settings.customRpcUrl || 'Custom endpoint not set'
      : settings.rpcProvider === 'public'
        ? 'https://api.mainnet-beta.solana.com'
        : state.heliusConfigured
          ? 'Helius key connected'
          : 'Helius key missing'

  return (
    <div className="solana-runtime-stack">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Runtime Stack</div>
          <h3 className="solana-token-launch-title">What DAEMON will actually use right now</h3>
          <p className="solana-token-launch-copy">
            The wallet settings now define the live Solana runtime path for RPC, wallet UX, swaps, and transaction submission.
          </p>
        </div>
      </div>

      <div className="solana-runtime-grid">
        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">RPC</span>
            <span className={`solana-ecosystem-status ${settings.rpcProvider === 'helius' ? (state.heliusConfigured ? 'native' : 'guided') : 'native'}`}>
              {rpcLabel}
            </span>
          </div>
          <div className="solana-runtime-value">{rpcLabel}</div>
          <div className="solana-runtime-detail">{rpcDetail}</div>
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Wallet Path</span>
            <span className="solana-ecosystem-status native">{settings.preferredWallet === 'phantom' ? 'Phantom' : 'Wallet Standard'}</span>
          </div>
          <div className="solana-runtime-value">{settings.preferredWallet === 'phantom' ? 'Phantom-first' : 'Wallet Standard'}</div>
          <div className="solana-runtime-detail">
            {settings.preferredWallet === 'phantom'
              ? 'Optimize flows for Phantom Connect, with Solana wallet UX anchored around Phantom-first handoff.'
              : 'Prefer the multi-wallet compatibility path for Backpack, Solflare, and other Wallet Standard clients.'}
          </div>
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Swap Engine</span>
            <span className={`solana-ecosystem-status ${state.jupiterConfigured ? 'native' : 'guided'}`}>
              {state.jupiterConfigured ? 'Ready' : 'Needs Key'}
            </span>
          </div>
          <div className="solana-runtime-value">Jupiter</div>
          <div className="solana-runtime-detail">
            {state.jupiterConfigured
              ? 'Quotes and swap execution are live through the Jupiter API.'
              : 'Add a Jupiter API key in Wallet settings to enable quotes and execution.'}
          </div>
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Submission</span>
            <span className={`solana-ecosystem-status ${settings.executionMode === 'jito' ? 'native' : 'guided'}`}>
              {settings.executionMode === 'jito' ? 'Jito' : 'RPC'}
            </span>
          </div>
          <div className="solana-runtime-value">{settings.executionMode === 'jito' ? 'Jito block engine' : 'Standard RPC path'}</div>
          <div className="solana-runtime-detail">
            {settings.executionMode === 'jito'
              ? settings.jitoBlockEngineUrl
              : 'Transfers and swaps submit over the selected RPC provider with standard confirmation.'}
          </div>
        </section>
      </div>
    </div>
  )
}
