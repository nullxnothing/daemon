import { useState } from 'react'
import { useNotificationsStore } from '../../store/notifications'
import { compactAddress } from '../../utils/textDisplay'
import './WalletPanel.css'

interface WalletOnrampProps {
  walletId: string
  walletName: string
  walletAddress: string
  moonpayStatus: MoonpayStatus
  onBack: () => void
  onConfigure: () => void
}

export function WalletOnramp({
  walletId,
  walletName,
  walletAddress,
  moonpayStatus,
  onBack,
  onConfigure,
}: WalletOnrampProps) {
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)
  const [amountUsd, setAmountUsd] = useState('50')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const environmentLabel = moonpayStatus.environment === 'production' ? 'Production' : 'Sandbox'

  const openOnramp = async () => {
    const amount = Number(amountUsd)
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Enter a whole-dollar amount.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await window.daemon.wallet.openMoonpayOnramp({
        walletId,
        baseCurrencyAmount: amount,
        baseCurrencyCode: 'usd',
      })
      if (res.ok && res.data) {
        pushSuccess(`MoonPay opened for ${compactAddress(res.data.walletAddress)}`, 'Wallet')
        return
      }

      const message = res.error ?? 'Failed to open MoonPay'
      setError(message)
      pushError(message, 'Wallet')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open MoonPay'
      setError(message)
      pushError(message, 'Wallet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="wallet-section wallet-onramp-section">
      <div className="wallet-view-header">
        <div>
          <div className="wallet-section-title">Buy SOL</div>
          <div className="wallet-caption">MoonPay hosted checkout with the active wallet as the destination.</div>
        </div>
        <button type="button" className="wallet-icon-btn" onClick={onBack}>Back</button>
      </div>

      <div className="wallet-onramp-card">
        <div className="wallet-onramp-head">
          <div>
            <div className="wallet-label">MoonPay onramp</div>
            <div className="wallet-caption">
              {moonpayStatus.configured
                ? `${environmentLabel} keys active · ${moonpayStatus.publishableKeyHint}`
                : 'Add MoonPay keys in Infrastructure before opening checkout.'}
            </div>
          </div>
          <span className={`wallet-state-badge ${moonpayStatus.configured ? 'live' : 'muted'}`}>
            {moonpayStatus.configured ? environmentLabel : 'Not configured'}
          </span>
        </div>

        <div className="wallet-onramp-grid">
          <div className="wallet-onramp-field">
            <span className="wallet-overview-label">Destination</span>
            <strong>{walletName}</strong>
            <p>{compactAddress(walletAddress)}</p>
          </div>
          <div className="wallet-onramp-field">
            <span className="wallet-overview-label">Asset</span>
            <strong>SOL</strong>
            <p>Solana buy flow</p>
          </div>
          <label className="wallet-onramp-field wallet-onramp-amount">
            <span className="wallet-overview-label">Spend</span>
            <input
              className="wallet-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amountUsd}
              onChange={(event) => setAmountUsd(event.target.value)}
              placeholder="50"
            />
          </label>
        </div>

        {error && <div className="wallet-error-msg">{error}</div>}

        <div className="wallet-actions wallet-actions-wrap">
          <button
            type="button"
            className="wallet-btn primary"
            onClick={() => void openOnramp()}
            disabled={!moonpayStatus.configured || loading}
          >
            {loading ? 'Opening...' : 'Open MoonPay'}
          </button>
          <button type="button" className="wallet-btn" onClick={onConfigure}>Configure MoonPay</button>
        </div>
      </div>
    </section>
  )
}
