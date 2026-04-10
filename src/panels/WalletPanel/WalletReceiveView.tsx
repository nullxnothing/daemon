import { useState } from 'react'
import { useNotificationsStore } from '../../store/notifications'
import './WalletPanel.css'

interface WalletReceiveViewProps {
  address: string
  walletName: string
  onBack: () => void
}

export function WalletReceiveView({ address, walletName, onBack }: WalletReceiveViewProps) {
  const [copied, setCopied] = useState(false)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)

  const handleCopy = async () => {
    const res = await window.daemon.env.copyValue(address)
    if (res.ok) {
      setCopied(true)
      pushSuccess(`${walletName} address copied`, 'Wallet')
      setTimeout(() => setCopied(false), 2000)
      return
    }
    pushError(res.error ?? 'Failed to copy wallet address', 'Wallet')
  }

  return (
    <section className="wallet-section">
      <div className="wallet-view-header">
        <button className="wallet-btn" onClick={onBack}>Back</button>
        <div className="wallet-section-title" style={{ margin: 0 }}>Receive</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="wallet-receive-container">
        <div className="wallet-label">{walletName}</div>
        <div className="wallet-caption" style={{ marginBottom: 8 }}>
          Send SOL or SPL tokens to this address
        </div>

        <div className="wallet-address-display">{address}</div>

        <button
          className="wallet-btn primary wallet-btn-full"
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy Address'}
        </button>
      </div>
    </section>
  )
}
