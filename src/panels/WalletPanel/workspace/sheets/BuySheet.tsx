import { useEffect, useState } from 'react'
import { Sheet, type SheetWallet } from './Sheet'
import { WalletOnramp } from '../../WalletOnramp'
import styles from '../WalletWorkspace.module.css'

const DEFAULT_STATUS: MoonpayStatus = { configured: false, environment: null, publishableKeyHint: null }

export function BuySheet({ wallet, onClose }: { wallet: SheetWallet; onClose: () => void }) {
  const [status, setStatus] = useState<MoonpayStatus>(DEFAULT_STATUS)

  useEffect(() => {
    void window.daemon.wallet.moonpayStatus().then((res) => {
      if (res.ok && res.data) setStatus(res.data)
    }).catch(() => {})
  }, [])

  return (
    <Sheet eyebrow={`BUY SOL · ${wallet.name}`} title="Buy SOL" width={460} onClose={onClose}>
      <div className={styles.formHost}>
        <WalletOnramp
          walletId={wallet.id}
          walletName={wallet.name}
          walletAddress={wallet.address}
          moonpayStatus={status}
          onBack={onClose}
          onConfigure={onClose}
        />
      </div>
    </Sheet>
  )
}
