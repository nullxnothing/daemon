import { useState } from 'react'
import { Sheet, type SheetWallet } from './Sheet'
import { Icon, type IconName } from '../icons'
import { useNotificationsStore } from '../../../../store/notifications'
import { fmtUsd, shortAddr } from '../helpers'
import styles from '../WalletWorkspace.module.css'

interface MenuItem {
  key: string
  icon: IconName
  label: string
  danger?: boolean
  onClick: () => void
}

export function ManageWalletSheet({
  wallet,
  canAssignProject,
  onClose,
  onReceive,
  onSetDefault,
  onAssignProject,
  onDelete,
}: {
  wallet: SheetWallet
  canAssignProject: boolean
  onClose: () => void
  onReceive: () => void
  onSetDefault: () => Promise<void> | void
  onAssignProject: () => Promise<void> | void
  onDelete: () => Promise<void> | void
}) {
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const pushError = useNotificationsStore((s) => s.pushError)
  const [exporting, setExporting] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const handleExport = async () => {
    if (confirmText !== 'EXPORT') return
    const res = await window.daemon.wallet.exportPrivateKey(wallet.id)
    if (res.ok && res.data) {
      pushSuccess('Private key copied to clipboard for 30 seconds', 'Wallet')
      setExporting(false)
      setConfirmText('')
      onClose()
    } else {
      pushError(res.error ?? 'Failed to export key', 'Wallet')
    }
  }

  const items: MenuItem[] = [
    !wallet.isDefault && !wallet.isAgent && { key: 'main', icon: 'spark', label: 'Set as main wallet', onClick: () => { void onSetDefault(); onClose() } },
    canAssignProject && !wallet.isAgent && { key: 'use', icon: 'check', label: 'Use for this project', onClick: () => { void onAssignProject(); onClose() } },
    { key: 'receive', icon: 'receive', label: 'Receive', onClick: onReceive },
    wallet.canSign && { key: 'export', icon: 'key', label: 'Export private key', onClick: () => setExporting(true) },
    { key: 'remove', icon: 'trash', label: 'Remove wallet', danger: true, onClick: () => { void onDelete(); onClose() } },
  ].filter(Boolean) as MenuItem[]

  return (
    <Sheet eyebrow={wallet.isAgent ? 'AGENT WALLET' : 'MANAGE WALLET'} title={wallet.name} width={380} onClose={onClose}>
      <div className={styles.addrStrip}>
        <code className={styles.mono}>{shortAddr(wallet.address)}</code>
        <span className={`${styles.mono} ${styles.dim}`} style={{ marginLeft: 'auto' }}>{fmtUsd(wallet.totalUsd)}</span>
        {wallet.isDefault && <span className={`${styles.tag} ${styles.tagGreen}`}>MAIN</span>}
        {wallet.canSign && <span className={styles.tag}>CAN SIGN</span>}
      </div>

      {exporting ? (
        <div className={styles.fieldBlock}>
          <span className={styles.label}>Type EXPORT to copy the private key</span>
          <input
            className={`${styles.field} ${styles.mono}`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="EXPORT"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`${styles.btn} ${styles.primary}`} disabled={confirmText !== 'EXPORT'} onClick={() => void handleExport()}>Copy private key</button>
            <button className={styles.btn} onClick={() => { setExporting(false); setConfirmText('') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className={styles.menu}>
          {items.map((it) => (
            <button key={it.key} className={`${styles.menuItem}${it.danger ? ' ' + styles.menuItemDanger : ''}`} onClick={it.onClick}>
              <Icon name={it.icon} size={15} />
              <span>{it.label}</span>
              <Icon name="arrowR" size={14} style={{ marginLeft: 'auto', opacity: 0.4 }} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
