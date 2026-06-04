import { Sheet, type SheetWallet } from './Sheet'
import { WalletSwapForm } from '../../WalletSwapForm'
import styles from '../WalletWorkspace.module.css'

export function SwapSheet({
  wallet,
  executionMode,
  cluster,
  onClose,
  onDone,
}: {
  wallet: SheetWallet
  executionMode: WalletInfrastructureSettings['executionMode']
  cluster: WalletInfrastructureSettings['cluster']
  onClose: () => void
  onDone: () => Promise<void>
}) {
  return (
    <Sheet eyebrow={`SWAP · ${wallet.name}`} title="Swap tokens" width={460} onClose={onClose}>
      <div className={styles.formHost}>
        <WalletSwapForm
          walletId={wallet.id}
          walletName={wallet.name}
          holdings={wallet.holdings.map((h) => ({ mint: h.mint, symbol: h.symbol, amount: h.amount }))}
          executionMode={executionMode}
          cluster={cluster}
          onBack={onClose}
          onRefresh={onDone}
        />
      </div>
    </Sheet>
  )
}
