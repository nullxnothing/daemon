import { useEffect, useState } from 'react'
import { Toggle } from '../../components/Toggle'
import { SolflareWalletCard } from './SolflareWalletCard'
import { WalletAdapterCard } from './WalletAdapterCard'
import './WalletPanel.css'

interface WalletSettingsProps {
  showMarketTape: boolean
  showTitlebarWallet: boolean
  heliusConfigured: boolean
  jupiterConfigured: boolean
  moonpayStatus: MoonpayStatus
  infrastructure: WalletInfrastructureSettings
  error: string | null
  onToggleTape: (checked: boolean) => Promise<void>
  onToggleTitlebarWallet: (checked: boolean) => Promise<void>
  onSaveHelius: (key: string) => Promise<void>
  onDeleteHelius: () => Promise<void>
  onSaveJupiter: (key: string) => Promise<void>
  onDeleteJupiter: () => Promise<void>
  onSaveMoonpayKeys: (publishableKey: string, secretKey: string) => Promise<void>
  onDeleteMoonpayKeys: () => Promise<void>
  onSaveInfrastructure: (settings: WalletInfrastructureSettings) => Promise<void>
  onTrackSolflareWallet: (address: string) => Promise<void>
}

export function WalletSettings({
  showMarketTape,
  showTitlebarWallet,
  heliusConfigured,
  jupiterConfigured,
  moonpayStatus,
  infrastructure,
  error,
  onToggleTape,
  onToggleTitlebarWallet,
  onSaveHelius,
  onDeleteHelius,
  onSaveJupiter,
  onDeleteJupiter,
  onSaveMoonpayKeys,
  onDeleteMoonpayKeys,
  onSaveInfrastructure,
  onTrackSolflareWallet,
}: WalletSettingsProps) {
  const [heliusKey, setHeliusKey] = useState('')
  const [jupiterKey, setJupiterKey] = useState('')
  const [moonpayPublishableKey, setMoonpayPublishableKey] = useState('')
  const [moonpaySecretKey, setMoonpaySecretKey] = useState('')
  const [draftInfra, setDraftInfra] = useState<WalletInfrastructureSettings>(infrastructure)

  useEffect(() => {
    setDraftInfra(infrastructure)
  }, [infrastructure])

  const handleSaveHelius = async () => {
    if (!heliusKey.trim()) return
    await onSaveHelius(heliusKey.trim())
    setHeliusKey('')
  }

  const handleSaveJupiter = async () => {
    if (!jupiterKey.trim()) return
    await onSaveJupiter(jupiterKey.trim())
    setJupiterKey('')
  }

  const handleSaveMoonpay = async () => {
    if (!moonpayPublishableKey.trim() || !moonpaySecretKey.trim()) return
    await onSaveMoonpayKeys(moonpayPublishableKey.trim(), moonpaySecretKey.trim())
    setMoonpayPublishableKey('')
    setMoonpaySecretKey('')
  }

  const rpcReady = getRpcReady(draftInfra, heliusConfigured)
  const rpcStatusLabel = rpcReady ? 'RPC ready' : 'Setup needed'
  const rpcProviderLabel = getRpcProviderLabel(draftInfra)
  const walletPreferenceLabel = getWalletPreferenceLabel(draftInfra.preferredWallet)

  const preferSolflare = async () => {
    const next = { ...draftInfra, preferredWallet: 'solflare' as const }
    setDraftInfra(next)
    await onSaveInfrastructure(next)
  }

  const preferWalletStandard = async () => {
    const next = { ...draftInfra, preferredWallet: 'wallet-standard' as const }
    setDraftInfra(next)
    await onSaveInfrastructure(next)
  }

  return (
    <section className="wallet-section wallet-settings-shell">
      <div className="wallet-section-header">
        <div>
          <div className="wallet-section-title">Infrastructure</div>
          <div className="wallet-caption">Keep wallet visibility, RPC routing, and execution services configured for the whole workspace.</div>
        </div>
      </div>
      {error && <div className="wallet-empty">{error}</div>}

      <div className="wallet-settings-layout">
        <div className="wallet-settings-card wallet-settings-card--full wallet-runtime-summary-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">DAEMON Solana Runtime</div>
              <div className="wallet-caption">
                These settings are not just wallet preferences. DAEMON uses them to steer project scaffolds, wallet flows,
                token launch execution, toolbox guidance, and the Solana runtime it will keep expanding.
              </div>
            </div>
            <span className={`wallet-state-badge ${rpcReady ? 'live' : 'muted'}`}>
              {rpcStatusLabel}
            </span>
          </div>

          <div className="wallet-runtime-summary-grid">
            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Cluster</div>
              <div className="wallet-runtime-summary-value">
                {draftInfra.cluster}
              </div>
              <div className="wallet-caption">
                DAEMON uses this cluster for wallet execution, generated project defaults, deploy proof, and explorer links.
              </div>
            </div>

            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Reads + Data</div>
              <div className="wallet-runtime-summary-value">
                {rpcProviderLabel}
              </div>
              <div className="wallet-caption">
                DAEMON uses this path for balance reads, holdings, toolbox checks, and generated Solana transports.
              </div>
            </div>

            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Wallet UX</div>
              <div className="wallet-runtime-summary-value">
                {walletPreferenceLabel}
              </div>
              <div className="wallet-caption">
                DAEMON's built-in wallet currently signs with imported or generated local signers. This preference is used for generated app defaults.
              </div>
            </div>

            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Execution</div>
              <div className="wallet-runtime-summary-value">
                {draftInfra.executionMode === 'jito' ? 'Jito block engine' : 'Standard RPC submission'}
              </div>
              <div className="wallet-caption">
                Wallet sends, swaps, and launch flows should converge on this same transaction pipeline.
              </div>
            </div>

            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Swap Layer</div>
              <div className="wallet-runtime-summary-value">
                {jupiterConfigured ? 'Jupiter ready' : 'Jupiter key missing'}
              </div>
              <div className="wallet-caption">
                DAEMON already treats Jupiter as the shared swap engine. The key makes that runtime usable instead of aspirational.
              </div>
            </div>

            <div className="wallet-runtime-summary-item">
              <div className="wallet-runtime-summary-label">Onramp</div>
              <div className="wallet-runtime-summary-value">
                {moonpayStatus.configured ? `MoonPay ${moonpayStatus.environment}` : 'MoonPay missing'}
              </div>
              <div className="wallet-caption">
                MoonPay opens a signed hosted buy flow with the active wallet prefilled for SOL deposits.
              </div>
            </div>
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Display</div>
              <div className="wallet-caption">Choose which wallet signals stay visible around the shell.</div>
            </div>
          </div>

          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Market Tape</div>
              <div className="wallet-caption">BTC, SOL, ETH in the bottom bar</div>
            </div>
            <Toggle checked={showMarketTape} onChange={onToggleTape} />
          </div>
          <div className="wallet-toggle-row">
            <div>
              <div className="wallet-label">Show Titlebar Balance</div>
              <div className="wallet-caption">Display the portfolio balance in the titlebar</div>
            </div>
            <Toggle checked={showTitlebarWallet} onChange={onToggleTitlebarWallet} />
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Cluster + RPC Provider</div>
              <div className="wallet-caption">
                Choose the Solana transport DAEMON should trust for wallet reads, toolbox checks, and generated project defaults.
              </div>
            </div>
            <span className={`wallet-state-badge ${rpcReady ? 'live' : 'muted'}`}>
              {rpcStatusLabel} · {draftInfra.cluster}
            </span>
          </div>

          <select
            className="wallet-input"
            value={draftInfra.cluster}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, cluster: e.target.value as WalletInfrastructureSettings['cluster'] }))}
          >
            <option value="devnet">Devnet - default for builds</option>
            <option value="mainnet-beta">Mainnet-beta - requires review</option>
            <option value="localnet">Localnet - validator or Surfpool</option>
          </select>
          <select
            className="wallet-input"
            value={draftInfra.rpcProvider}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, rpcProvider: e.target.value as WalletInfrastructureSettings['rpcProvider'] }))}
          >
            <option value="helius">Helius</option>
            <option value="public">Public RPC for selected cluster</option>
            <option value="quicknode">QuickNode</option>
            <option value="custom">Custom RPC URL</option>
          </select>
          {draftInfra.rpcProvider === 'quicknode' && (
            <input
              className="wallet-input"
              value={draftInfra.quicknodeRpcUrl}
              onChange={(e) => setDraftInfra((prev) => ({ ...prev, quicknodeRpcUrl: e.target.value }))}
              placeholder="https://your-quicknode-endpoint.quiknode.pro/..."
            />
          )}
          {draftInfra.rpcProvider === 'custom' && (
            <input
              className="wallet-input"
              value={draftInfra.customRpcUrl}
              onChange={(e) => setDraftInfra((prev) => ({ ...prev, customRpcUrl: e.target.value }))}
              placeholder="https://your-rpc-provider.example"
            />
          )}
          <div className="wallet-actions wallet-actions-wrap">
            <button type="button" className="wallet-btn primary" onClick={() => onSaveInfrastructure(draftInfra)}>Save RPC Settings</button>
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Helius API Key</div>
              <div className="wallet-caption">
                {heliusConfigured ? 'A Helius key is stored for indexed wallet data, Helius RPC access, and DAEMON runtime upgrades built on Helius.' : 'Add a Helius key to enable indexed balances, holdings, realtime-ready reads, and the Helius-backed DAEMON runtime.'}
              </div>
            </div>
            <span className={`wallet-state-badge ${heliusConfigured ? 'live' : 'muted'}`}>
              {heliusConfigured ? 'Connected' : 'Missing'}
            </span>
          </div>

          <input
            className="wallet-input"
            type="password"
            autoComplete="off"
            value={heliusKey}
            onChange={(e) => setHeliusKey(e.target.value)}
            placeholder={heliusConfigured ? 'Replace Helius API key' : 'HELIUS_API_KEY'}
          />
          <div className="wallet-actions wallet-actions-wrap">
            <button type="button" className="wallet-btn primary" onClick={handleSaveHelius}>Save Key</button>
            {heliusConfigured && (
              <button type="button" className="wallet-btn danger" onClick={onDeleteHelius}>Delete Key</button>
            )}
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Wallet + Execution Pipeline</div>
              <div className="wallet-caption">
                Configure the wallet model and transaction path DAEMON should keep reusing for sends, swaps, and launches.
              </div>
            </div>
            <span className={`wallet-state-badge ${jupiterConfigured ? 'live' : 'muted'}`}>
              {jupiterConfigured ? 'Ready' : 'Key Missing'}
            </span>
          </div>

          <select
            className="wallet-input"
            value={draftInfra.swapProvider}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, swapProvider: e.target.value as WalletInfrastructureSettings['swapProvider'] }))}
          >
            <option value="jupiter">Jupiter Swap API</option>
          </select>
          <select
            className="wallet-input"
            value={draftInfra.preferredWallet}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, preferredWallet: e.target.value as WalletInfrastructureSettings['preferredWallet'] }))}
          >
            <option value="phantom">Local signer + Phantom app defaults</option>
            <option value="solflare">Solflare SDK + app defaults</option>
            <option value="wallet-standard">DAEMON Wallet Adapter (any wallet · Solflare recommended)</option>
          </select>
          <select
            className="wallet-input"
            value={draftInfra.executionMode}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, executionMode: e.target.value as WalletInfrastructureSettings['executionMode'] }))}
          >
            <option value="rpc">Standard RPC submission</option>
            <option value="jito">Jito block engine</option>
          </select>
          {draftInfra.executionMode === 'jito' && (
            <input
              className="wallet-input"
              value={draftInfra.jitoBlockEngineUrl}
              onChange={(e) => setDraftInfra((prev) => ({ ...prev, jitoBlockEngineUrl: e.target.value }))}
              placeholder="https://mainnet.block-engine.jito.wtf/api/v1/transactions"
            />
          )}
          <input
            className="wallet-input"
            type="password"
            autoComplete="off"
            value={jupiterKey}
            onChange={(e) => setJupiterKey(e.target.value)}
            placeholder={jupiterConfigured ? 'Replace JUPITER_API_KEY' : 'JUPITER_API_KEY'}
          />
          <div className="wallet-actions wallet-actions-wrap">
            <button type="button" className="wallet-btn primary" onClick={handleSaveJupiter}>Save Jupiter Key</button>
            <button type="button" className="wallet-btn primary-soft" onClick={() => onSaveInfrastructure(draftInfra)}>Save Execution Settings</button>
            {jupiterConfigured && (
              <button type="button" className="wallet-btn danger" onClick={onDeleteJupiter}>Delete Key</button>
            )}
          </div>
        </div>

        {draftInfra.preferredWallet === 'wallet-standard' ? (
          <WalletAdapterCard
            cluster={draftInfra.cluster}
            preferredWallet={draftInfra.preferredWallet}
            onPreferWalletStandard={preferWalletStandard}
            onTrackWallet={onTrackSolflareWallet}
          />
        ) : (
          <SolflareWalletCard
            cluster={draftInfra.cluster}
            preferredWallet={draftInfra.preferredWallet}
            onPreferSolflare={preferSolflare}
            onTrackWallet={onTrackSolflareWallet}
          />
        )}

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">MoonPay Onramp</div>
              <div className="wallet-caption">
                {moonpayStatus.configured
                  ? `Signed SOL checkout is ready with ${moonpayStatus.publishableKeyHint}.`
                  : 'Store MoonPay dashboard keys to open signed SOL buy URLs from the wallet panel.'}
              </div>
            </div>
            <span className={`wallet-state-badge ${moonpayStatus.configured ? 'live' : 'muted'}`}>
              {moonpayStatus.configured ? moonpayStatus.environment : 'Missing'}
            </span>
          </div>

          <input
            className="wallet-input"
            type="password"
            autoComplete="off"
            value={moonpayPublishableKey}
            onChange={(e) => setMoonpayPublishableKey(e.target.value)}
            placeholder={moonpayStatus.configured ? 'Replace pk_test or pk_live key' : 'MOONPAY_PUBLISHABLE_KEY'}
          />
          <input
            className="wallet-input"
            type="password"
            autoComplete="off"
            value={moonpaySecretKey}
            onChange={(e) => setMoonpaySecretKey(e.target.value)}
            placeholder={moonpayStatus.configured ? 'Replace sk_test or sk_live key' : 'MOONPAY_SECRET_KEY'}
          />
          <div className="wallet-actions wallet-actions-wrap">
            <button type="button" className="wallet-btn primary" onClick={handleSaveMoonpay}>Save MoonPay Keys</button>
            {moonpayStatus.configured && (
              <button type="button" className="wallet-btn danger" onClick={onDeleteMoonpayKeys}>Delete Keys</button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function getRpcReady(settings: WalletInfrastructureSettings, heliusConfigured: boolean): boolean {
  if (settings.rpcProvider === 'helius') return heliusConfigured
  if (settings.rpcProvider === 'quicknode') return settings.quicknodeRpcUrl.trim().length > 0
  if (settings.rpcProvider === 'custom') return settings.customRpcUrl.trim().length > 0
  return true
}

function getRpcProviderLabel(settings: WalletInfrastructureSettings): string {
  if (settings.rpcProvider === 'helius') return 'Helius indexed runtime'
  if (settings.rpcProvider === 'quicknode') return 'QuickNode runtime'
  if (settings.rpcProvider === 'custom') return 'Custom RPC runtime'
  return 'Public RPC fallback'
}

function getWalletPreferenceLabel(preferredWallet: WalletInfrastructureSettings['preferredWallet']): string {
  if (preferredWallet === 'solflare') return 'Solflare SDK + app defaults'
  if (preferredWallet === 'wallet-standard') return 'Wallet Standard app defaults'
  return 'Local signer, Phantom-first app defaults'
}
