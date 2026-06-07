import { Sheet, type SheetWallet } from './Sheet'
import { Icon } from '../icons'
import { useClipboard } from '../../../../hooks/useClipboard'
import { LiveRegion } from '../../../../components/LiveRegion'
import styles from '../WalletWorkspace.module.css'

export function ReceiveSheet({ wallet, onClose }: { wallet: SheetWallet; onClose: () => void }) {
  const { copied, copy } = useClipboard({ resetMs: 2000 })

  return (
    <Sheet eyebrow={`RECEIVE · ${wallet.name}`} title="Receive funds" width={400} onClose={onClose}>
      <div className={styles.recv}>
        <div className={`${styles.recvNote} ${styles.mono}`}>Send only Solana (SOL &amp; SPL tokens) to this address.</div>
        <div className={styles.recvAddr}>
          <span className={styles.label}>{wallet.name} address</span>
          <div className={styles.recvAddrRow}>
            <code className={styles.mono}>{wallet.address}</code>
            <button className={styles.btn} onClick={() => void copy(wallet.address)}>
              <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <LiveRegion message={copied ? 'Wallet address copied to clipboard' : ''} />
      </div>
    </Sheet>
  )
}
