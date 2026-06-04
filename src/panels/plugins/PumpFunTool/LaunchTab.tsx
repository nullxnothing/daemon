import { TokenLauncher } from '../../../components/TokenLauncher/TokenLauncher'

interface Props {
  walletId: string | null
  cluster: WalletInfrastructureSettings['cluster']
}

/** PumpFun plugin launch tab — delegates to the shared TokenLauncher. */
export function LaunchTab({ walletId, cluster }: Props) {
  return <TokenLauncher walletId={walletId} cluster={cluster} />
}
