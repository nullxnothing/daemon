import { useEffect, useState } from 'react'
import {
  connectWallet,
  disconnectWallet,
  getProviders,
  getWalletAdapterState,
  signMessage,
  subscribeWalletAdapter,
  type DaemonWalletProvider,
  type WalletAdapterState,
} from '../../lib/walletAdapter'
import { compactAddress } from '../../utils/textDisplay'

interface WalletAdapterCardProps {
  cluster: WalletInfrastructureSettings['cluster']
  preferredWallet: WalletInfrastructureSettings['preferredWallet']
  onPreferWalletStandard: () => Promise<void>
  onTrackWallet: (address: string) => Promise<void>
}

export function WalletAdapterCard({
  cluster,
  preferredWallet,
  onPreferWalletStandard,
  onTrackWallet,
}: WalletAdapterCardProps) {
  const [state, setState] = useState<WalletAdapterState>(getWalletAdapterState())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => subscribeWalletAdapter(setState), [])

  const providers = getProviders()
  const featured = providers.find((provider) => provider.isHighlighted) ?? providers[0]
  const rest = providers.filter((provider) => provider !== featured)
  const isConnected = state.status === 'connected' && Boolean(state.publicKey)
  const isBusy = busy || state.status === 'connecting' || state.status === 'disconnecting'
  const isLocalnet = cluster === 'localnet'
  const isPreferred = preferredWallet === 'wallet-standard'

  const connect = async (provider: DaemonWalletProvider) => {
    if (!provider.isAvailable(cluster)) {
      setMessage(`${provider.name} is not available on this network yet`)
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await connectWallet(provider.id, cluster)
      setMessage(`${provider.name} connected`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${provider.name} connection failed`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await disconnectWallet()
      setMessage('Wallet disconnected')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const signCheck = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const signature = await signMessage(`DAEMON wallet adapter check on ${cluster}`)
      setMessage(`Signed ${compactAddress(signature.signature)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Signature failed')
    } finally {
      setBusy(false)
    }
  }

  const trackWallet = async () => {
    if (!state.publicKey) return
    setBusy(true)
    setMessage(null)
    try {
      await onTrackWallet(state.publicKey)
      setMessage('Address tracked')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not track address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wallet-settings-card">
      <div className="wallet-settings-card-head">
        <div>
          <div className="wallet-label">DAEMON Wallet Adapter</div>
          <div className="wallet-caption">
            Connect any Solana wallet. Solflare is the recommended partner for external signing while DAEMON keeps local signers available for internal execution.
          </div>
        </div>
        <span className={`wallet-state-badge ${isConnected ? 'live' : 'muted'}`}>
          {isConnected ? 'Connected' : isPreferred ? 'Preferred' : 'Available'}
        </span>
      </div>

      {isConnected ? (
        <ConnectedAccount state={state} cluster={cluster} />
      ) : (
        <div className="wallet-adapter-list">
          <ProviderRow provider={featured} featured cluster={cluster} onClick={() => connect(featured)} disabled={isBusy} />
          {rest.length > 0 && <div className="wallet-adapter-sublabel">MORE WALLETS</div>}
          {rest.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              cluster={cluster}
              onClick={() => connect(provider)}
              disabled={isBusy}
            />
          ))}
        </div>
      )}

      {state.error && <div className="wallet-error-msg">{state.error}</div>}
      {message && <div className="wallet-success-msg">{message}</div>}

      <div className="wallet-actions wallet-actions-wrap">
        {isConnected && (
          <button type="button" className="wallet-btn" onClick={disconnect} disabled={isBusy}>
            {isBusy ? 'Disconnecting...' : 'Disconnect'}
          </button>
        )}
        <button type="button" className="wallet-btn primary-soft" onClick={onPreferWalletStandard} disabled={isBusy || isPreferred}>
          {isPreferred ? 'Adapter preferred' : 'Use adapter'}
        </button>
        <button type="button" className="wallet-btn" onClick={signCheck} disabled={isBusy || !isConnected}>
          Sign check
        </button>
        <button type="button" className="wallet-btn" onClick={trackWallet} disabled={isBusy || !isConnected}>
          Track address
        </button>
      </div>
    </div>
  )
}

interface ProviderRowProps {
  provider: DaemonWalletProvider
  cluster: WalletInfrastructureSettings['cluster']
  featured?: boolean
  disabled?: boolean
  onClick: () => void
}

function ProviderRow({ provider, cluster, featured = false, disabled = false, onClick }: ProviderRowProps) {
  const available = provider.isAvailable(cluster)
  return (
    <button
      type="button"
      className={`wallet-adapter-row${featured ? ' featured' : ''}`}
      onClick={onClick}
      disabled={disabled || !available}
    >
      <img className="wallet-adapter-logo" src={provider.icon} alt="" width={featured ? 38 : 32} height={featured ? 38 : 32} />
      <span className="wallet-adapter-id">
        <span className="wallet-adapter-name">
          {provider.name}
        </span>
        <span className="wallet-adapter-sub">{provider.subtitle}</span>
      </span>
      <span className="wallet-adapter-cue">{available ? 'Connect' : 'Soon'}</span>
    </button>
  )
}

function ConnectedAccount({ state, cluster }: { state: WalletAdapterState; cluster: WalletInfrastructureSettings['cluster'] }) {
  return (
    <div className="wallet-runtime-summary-grid">
      <div className="wallet-runtime-summary-item">
        <div className="wallet-runtime-summary-label">Provider</div>
        <div className="wallet-runtime-summary-value">{state.provider ?? '—'}</div>
        <div className="wallet-caption">Active external signer.</div>
      </div>
      <div className="wallet-runtime-summary-item">
        <div className="wallet-runtime-summary-label">Address</div>
        <div className="wallet-runtime-summary-value">{state.publicKey ? compactAddress(state.publicKey) : 'Not connected'}</div>
        <div className="wallet-caption">{state.network ? `Connected on ${state.network}` : `Network ${cluster}`}</div>
      </div>
    </div>
  )
}
