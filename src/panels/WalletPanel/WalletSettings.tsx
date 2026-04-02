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
    <section className="wallet-section">
      <div className="wallet-section-title">Settings</div>
      {error && <div className="wallet-empty">{error}</div>}
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
      <div className="wallet-settings-block">
        <div className="wallet-label">Helius API Key</div>
        <div className="wallet-caption">
          {heliusConfigured ? 'A Helius key is currently stored for wallet data.' : 'Add a Helius key to enable balances, holdings, and portfolio refresh.'}
        </div>
        <input
          className="wallet-input"
          value={heliusKey}
          onChange={(e) => setHeliusKey(e.target.value)}
          placeholder={heliusConfigured ? 'Replace Helius API key' : 'HELIUS_API_KEY'}
        />
        <div className="wallet-actions">
          <button className="wallet-btn primary" onClick={handleSaveHelius}>Save Key</button>
          {heliusConfigured && (
            <button className="wallet-btn danger" onClick={onDeleteHelius}>Delete Key</button>
          )}
        </div>
      </div>

      <div className="wallet-settings-block">
        <div className="wallet-label">Manage Wallets</div>

        <div className="wallet-tab-group">
          <button className={`wallet-tab ${createTab === 'import' ? 'active' : ''}`} onClick={() => { setCreateTab('import'); onClearGenSuccess() }}>Import</button>
          <button className={`wallet-tab ${createTab === 'generate' ? 'active' : ''}`} onClick={() => { setCreateTab('generate'); onClearGenSuccess() }}>Generate</button>
        </div>

        {createTab === 'import' && (
          <div className="wallet-form">
            <input className="wallet-input" value={walletName} onChange={(e) => setWalletName(e.target.value)} placeholder="Wallet name" />
            <input className="wallet-input" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="Solana address" />
            <button className="wallet-btn primary" onClick={handleAddWallet}>Add Wallet</button>
          </div>
        )}

        {createTab === 'generate' && (
          <div className="wallet-form">
            <input className="wallet-input" value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="Wallet name" />
            <button className="wallet-btn primary" onClick={handleGenerate}>Generate Wallet</button>
            {genSuccess && (
              <div className="wallet-success-msg">Generated: {shortAddress(genSuccess)}</div>
            )}
          </div>
        )}

        <div className="wallet-list">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="wallet-row">
              <div className="wallet-row-main">
                <div className="wallet-name">
                  {wallet.name}
                  {wallet.isDefault && <span className="wallet-badge">default</span>}
                </div>
                <div className="wallet-value">${formatUsd(wallet.totalUsd)}</div>
              </div>
              <div className="wallet-row-sub">
                <span>{shortAddress(wallet.address)}</span>
                <span>{wallet.tokenCount} assets</span>
              </div>
              <div className="wallet-actions">
                {!wallet.isDefault && (
                  <button className="wallet-btn" onClick={() => onSetDefault(wallet.id)}>Set Default</button>
                )}
                {activeProjectId && (
                  <button className="wallet-btn" onClick={() => onAssignProject(wallet.id)}>Use For Project</button>
                )}
                {keypairCache[wallet.id] && (
                  <>
                    <button className="wallet-btn" onClick={() => onOpenSend(wallet.id, 'sol')}>Send SOL</button>
                    <button className="wallet-btn" onClick={() => onOpenSend(wallet.id, 'token')}>Send Token</button>
                    <button className="wallet-btn" onClick={() => onExportKeyStart(wallet.id)}>Export Key</button>
                  </>
                )}
                <button className="wallet-btn danger" onClick={() => onDeleteWallet(wallet.id)}>Remove</button>
              </div>
              {renderWalletInline(wallet.id)}
            </div>
          ))}
          {wallets.length === 0 && <div className="wallet-empty">No wallets configured</div>}
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
