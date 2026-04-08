import { useState } from 'react'
import { Toggle } from '../../components/Toggle'
import './WalletPanel.css'

interface WalletSettingsProps {
  showMarketTape: boolean
  showTitlebarWallet: boolean
  heliusConfigured: boolean
  wallets: Array<{
    id: string
    name: string
    address: string
    isDefault: boolean
    totalUsd: number
    tokenCount: number
  }>
  keypairCache: Record<string, boolean>
  activeProjectId: string | null
  error: string | null
  genSuccess: string | null
  onToggleTape: (checked: boolean) => Promise<void>
  onToggleTitlebarWallet: (checked: boolean) => Promise<void>
  onSaveHelius: (key: string) => Promise<void>
  onDeleteHelius: () => Promise<void>
  onAddWallet: (name: string, address: string) => Promise<void>
  onGenerateWallet: (name: string) => Promise<void>
  onClearGenSuccess: () => void
  onSetDefault: (walletId: string) => Promise<void>
  onAssignProject: (walletId: string) => Promise<void>
  onDeleteWallet: (walletId: string) => Promise<void>
  onOpenSend: (walletId: string, mode: 'sol' | 'token') => void
  onExportKeyStart: (walletId: string) => void
  renderWalletInline: (walletId: string) => React.ReactNode
}

export function WalletSettings({
  showMarketTape,
  showTitlebarWallet,
  heliusConfigured,
  wallets,
  keypairCache,
  activeProjectId,
  error,
  genSuccess,
  onToggleTape,
  onToggleTitlebarWallet,
  onSaveHelius,
  onDeleteHelius,
  onAddWallet,
  onGenerateWallet,
  onClearGenSuccess,
  onSetDefault,
  onAssignProject,
  onDeleteWallet,
  onOpenSend,
  onExportKeyStart,
  renderWalletInline,
}: WalletSettingsProps) {
  const [heliusKey, setHeliusKey] = useState('')
  const [createTab, setCreateTab] = useState<'import' | 'generate'>('import')
  const [walletName, setWalletName] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [genName, setGenName] = useState('')

  const handleSaveHelius = async () => {
    if (!heliusKey.trim()) return
    await onSaveHelius(heliusKey.trim())
    setHeliusKey('')
  }

  const handleAddWallet = async () => {
    if (!walletName.trim() || !walletAddress.trim()) return
    await onAddWallet(walletName.trim(), walletAddress.trim())
    setWalletName('')
    setWalletAddress('')
  }

  const handleGenerate = async () => {
    if (!genName.trim()) return
    await onGenerateWallet(genName.trim())
    setGenName('')
  }

  return (
    <section className="wallet-section wallet-settings-shell">
      <div className="wallet-section-header">
        <div>
          <div className="wallet-section-title">Settings</div>
          <div className="wallet-caption">Manage portfolio display, RPC access, and wallet operations from one place.</div>
        </div>
      </div>
      {error && <div className="wallet-empty">{error}</div>}

      <div className="wallet-settings-layout">
        <div className="wallet-settings-card">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Display</div>
              <div className="wallet-caption">Choose which portfolio signals stay visible across the shell.</div>
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
              <div className="wallet-label">Helius RPC</div>
              <div className="wallet-caption">
                {heliusConfigured ? 'A Helius key is currently stored for wallet data.' : 'Add a Helius key to enable balances, holdings, and portfolio refresh.'}
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

        <div className="wallet-settings-card wallet-settings-card--full">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Create Wallet</div>
              <div className="wallet-caption">Import an address for tracking or generate a fresh signing wallet inside DAEMON.</div>
            </div>
          </div>

          <div className="wallet-tab-group wallet-create-tabs">
            <button className={`wallet-tab ${createTab === 'import' ? 'active' : ''}`} onClick={() => { setCreateTab('import'); onClearGenSuccess() }}>Import</button>
            <button className={`wallet-tab ${createTab === 'generate' ? 'active' : ''}`} onClick={() => { setCreateTab('generate'); onClearGenSuccess() }}>Generate</button>
          </div>

          {createTab === 'import' && (
            <div className="wallet-form wallet-create-grid">
              <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name" />
              <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address" />
              <button className="wallet-btn primary wallet-btn-wide" onClick={handleAddWallet}>Add Wallet</button>
            </div>
          )}

          {createTab === 'generate' && (
            <div className="wallet-form wallet-create-grid">
              <input className="wallet-input" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Wallet name" />
              <button className="wallet-btn primary wallet-btn-wide" onClick={handleGenerate}>Generate Wallet</button>
              {genSuccess && (
                <div className="wallet-success-msg">Generated: {shortAddress(genSuccess)}</div>
              )}
            </div>
          )}
        </div>

        <div className="wallet-settings-card wallet-settings-card--full">
          <div className="wallet-settings-card-head">
            <div>
              <div className="wallet-label">Manage Wallets</div>
              <div className="wallet-caption">Choose defaults, link wallets to the active project, and manage signing operations.</div>
            </div>
          </div>

          <div className="wallet-list wallet-list-cards">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="wallet-row wallet-row-card">
              <div className="wallet-row-main wallet-row-main-top">
                <div className="wallet-row-identity">
                  <div className="wallet-name">
                    {wallet.name}
                  </div>
                  <div className="wallet-row-sub wallet-row-subtle wallet-row-chipline">
                    {wallet.isDefault && <span className="wallet-badge">default</span>}
                    <span className={`wallet-pill ${keypairCache[wallet.id] ? 'live' : 'muted'}`}>
                      {keypairCache[wallet.id] ? 'Signer' : 'Watch-only'}
                    </span>
                    <span className="wallet-pill">{shortAddress(wallet.address)}</span>
                    <span className="wallet-pill">{wallet.tokenCount} assets</span>
                  </div>
                </div>
                <div className="wallet-value wallet-value-strong">${formatUsd(wallet.totalUsd)}</div>
              </div>

              <div className="wallet-actions-card">
                <div className="wallet-actions wallet-actions-wrap wallet-actions-card-main">
                  {!wallet.isDefault && (
                    <button className="wallet-btn" onClick={() => onSetDefault(wallet.id)}>Set Default</button>
                  )}
                  {activeProjectId && (
                    <button className="wallet-btn primary-soft" onClick={() => onAssignProject(wallet.id)}>Use For Project</button>
                  )}
                  {keypairCache[wallet.id] && (
                    <button className="wallet-btn primary" onClick={() => onOpenSend(wallet.id, 'sol')}>Send Funds</button>
                  )}
                </div>
                <div className="wallet-actions wallet-actions-wrap wallet-actions-card-utility">
                  {keypairCache[wallet.id] && (
                    <button className="wallet-btn subtle" onClick={() => onExportKeyStart(wallet.id)}>Export Key</button>
                  )}
                  <button className="wallet-btn danger" onClick={() => onDeleteWallet(wallet.id)}>Remove</button>
                </div>
              </div>
              {renderWalletInline(wallet.id)}
            </div>
          ))}
          {wallets.length === 0 && <div className="wallet-empty">No wallets configured</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
