import { useEffect, useState } from 'react'
import { Toggle } from '../../components/Toggle'
import './WalletPanel.css'

interface WalletSettingsProps {
  showMarketTape: boolean
  showTitlebarWallet: boolean
  heliusConfigured: boolean
  jupiterConfigured: boolean
  infrastructure: WalletInfrastructureSettings
  error: string | null
  onToggleTape: (checked: boolean) => Promise<void>
  onToggleTitlebarWallet: (checked: boolean) => Promise<void>
  onSaveHelius: (key: string) => Promise<void>
  onDeleteHelius: () => Promise<void>
  onSaveJupiter: (key: string) => Promise<void>
  onDeleteJupiter: () => Promise<void>
  onSaveInfrastructure: (settings: WalletInfrastructureSettings) => Promise<void>
}

export function WalletSettings({
  showMarketTape,
  showTitlebarWallet,
  heliusConfigured,
  jupiterConfigured,
  infrastructure,
  error,
  onToggleTape,
  onToggleTitlebarWallet,
  onSaveHelius,
  onDeleteHelius,
  onSaveJupiter,
  onDeleteJupiter,
  onSaveInfrastructure,
}: WalletSettingsProps) {
  const [heliusKey, setHeliusKey] = useState('')
  const [jupiterKey, setJupiterKey] = useState('')
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
              <div className="wallet-label">RPC Provider</div>
              <div className="wallet-caption">Choose how DAEMON resolves Solana reads and transaction submission.</div>
            </div>
            <span className={`wallet-state-badge ${draftInfra.rpcProvider === 'helius' && heliusConfigured ? 'live' : 'muted'}`}>
              {draftInfra.rpcProvider.toUpperCase()}
            </span>
          </div>

          <select
            className="wallet-input"
            value={draftInfra.rpcProvider}
            onChange={(e) => setDraftInfra((prev) => ({ ...prev, rpcProvider: e.target.value as WalletInfrastructureSettings['rpcProvider'] }))}
          >
            <option value="helius">Helius</option>
            <option value="public">Public Mainnet RPC</option>
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
            <button className="wallet-btn primary" onClick={() => onSaveInfrastructure(draftInfra)}>Save RPC Settings</button>
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Helius API Key</div>
              <div className="wallet-caption">
                {heliusConfigured ? 'A Helius key is stored for indexed wallet data and Helius RPC access.' : 'Add a Helius key to enable indexed balances, holdings, and Helius-backed RPC.'}
              </div>
            </div>
            <span className={`wallet-state-badge ${heliusConfigured ? 'live' : 'muted'}`}>
              {heliusConfigured ? 'Connected' : 'Missing'}
            </span>
          </div>

          <input
            className="wallet-input"
            value={heliusKey}
            onChange={(e) => setHeliusKey(e.target.value)}
            placeholder={heliusConfigured ? 'Replace Helius API key' : 'HELIUS_API_KEY'}
          />
          <div className="wallet-actions wallet-actions-wrap">
            <button className="wallet-btn primary" onClick={handleSaveHelius}>Save Key</button>
            {heliusConfigured && (
              <button className="wallet-btn danger" onClick={onDeleteHelius}>Delete Key</button>
            )}
          </div>
        </div>

        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Swap Execution</div>
              <div className="wallet-caption">Configure the wallet path and submission route DAEMON uses for swaps and sends.</div>
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
            <option value="phantom">Phantom-first</option>
            <option value="wallet-standard">Wallet Standard</option>
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
            value={jupiterKey}
            onChange={(e) => setJupiterKey(e.target.value)}
            placeholder={jupiterConfigured ? 'Replace JUPITER_API_KEY' : 'JUPITER_API_KEY'}
          />
          <div className="wallet-actions wallet-actions-wrap">
            <button className="wallet-btn primary" onClick={handleSaveJupiter}>Save Jupiter Key</button>
            <button className="wallet-btn primary-soft" onClick={() => onSaveInfrastructure(draftInfra)}>Save Execution Settings</button>
            {jupiterConfigured && (
              <button className="wallet-btn danger" onClick={onDeleteJupiter}>Delete Key</button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
