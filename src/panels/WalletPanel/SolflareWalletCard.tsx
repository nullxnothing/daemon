import { useEffect, useState } from 'react'
import {
  connectSolflareWallet,
  disconnectSolflareWallet,
  getSolflareState,
  signSolflareMessage,
  subscribeSolflareWallet,
  type SolflareConnectionState,
} from '../../lib/solflareWallet'
import { compactAddress } from '../../utils/textDisplay'

interface SolflareWalletCardProps {
  cluster: WalletInfrastructureSettings['cluster']
  preferredWallet: WalletInfrastructureSettings['preferredWallet']
  onPreferSolflare: () => Promise<void>
  onTrackWallet: (address: string) => Promise<void>
}

export function SolflareWalletCard({
  cluster,
  preferredWallet,
  onPreferSolflare,
  onTrackWallet,
}: SolflareWalletCardProps) {
  const [connection, setConnection] = useState<SolflareConnectionState>(getSolflareState())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => subscribeSolflareWallet(setConnection), [])

  const isConnected = connection.status === 'connected' && Boolean(connection.publicKey)
  const isBusy = busy || connection.status === 'connecting' || connection.status === 'disconnecting'
  const isLocalnet = cluster === 'localnet'
  const isPreferred = preferredWallet === 'solflare'

  const connect = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await connectSolflareWallet(cluster)
      setMessage('Solflare connected')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Solflare connection failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await disconnectSolflareWallet()
      setMessage('Solflare disconnected')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Solflare disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const signCheck = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const signature = await signSolflareMessage(`DAEMON Solflare check on ${cluster}`)
      setMessage(`Signed ${compactAddress(signature.signature)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Solflare signature failed')
    } finally {
      setBusy(false)
    }
  }

  const trackWallet = async () => {
    if (!connection.publicKey) return
    setBusy(true)
    setMessage(null)
    try {
      await onTrackWallet(connection.publicKey)
      setMessage('Solflare address tracked')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not track Solflare address')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wallet-settings-card">
      <div className="wallet-settings-card-head">
        <div>
          <div className="wallet-label">Solflare Wallet</div>
          <div className="wallet-caption">
            Connect Solflare for external wallet approval while DAEMON keeps local signers available for internal execution.
          </div>
        </div>
        <span className={`wallet-state-badge ${isConnected ? 'live' : 'muted'}`}>
          {isConnected ? 'Connected' : isPreferred ? 'Preferred' : 'Available'}
        </span>
      </div>

      <div className="wallet-runtime-summary-grid wallet-solflare-grid">
        <div className="wallet-runtime-summary-item">
          <div className="wallet-runtime-summary-label">Network</div>
          <div className="wallet-runtime-summary-value">{isLocalnet ? 'Unsupported' : cluster}</div>
          <div className="wallet-caption">Solflare SDK supports devnet and mainnet-beta from DAEMON.</div>
        </div>
        <div className="wallet-runtime-summary-item">
          <div className="wallet-runtime-summary-label">Address</div>
          <div className="wallet-runtime-summary-value">{connection.publicKey ? compactAddress(connection.publicKey) : 'Not connected'}</div>
          <div className="wallet-caption">{connection.network ? `Connected on ${connection.network}` : 'Connect Solflare to track the public key.'}</div>
        </div>
      </div>

      {connection.error && <div className="wallet-error-msg">{connection.error}</div>}
      {message && <div className="wallet-success-msg">{message}</div>}

      <div className="wallet-actions wallet-actions-wrap">
        {!isConnected ? (
          <button type="button" className="wallet-btn primary" onClick={connect} disabled={isBusy || isLocalnet}>
            {isBusy ? 'Connecting...' : 'Connect Solflare'}
          </button>
        ) : (
          <button type="button" className="wallet-btn" onClick={disconnect} disabled={isBusy}>
            {isBusy ? 'Disconnecting...' : 'Disconnect'}
          </button>
        )}
        <button type="button" className="wallet-btn primary-soft" onClick={onPreferSolflare} disabled={isBusy || isPreferred}>
          {isPreferred ? 'Solflare preferred' : 'Use Solflare'}
        </button>
        <button type="button" className="wallet-btn" onClick={signCheck} disabled={isBusy || !isConnected}>
          Sign check
        </button>
        <button type="button" className="wallet-btn" onClick={trackWallet} disabled={isBusy || !isConnected}>
          Track address
        </button>
        <button type="button" className="wallet-btn" onClick={() => void window.daemon.shell.openExternal('https://www.solflare.com/')}>
          Open Solflare
        </button>
      </div>
    </div>
  )
}
