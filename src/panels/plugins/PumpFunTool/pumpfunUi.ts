import { canOpenSolscan, getSolscanTxUrl } from '../../../lib/solanaExplorer'

export function describePumpfunError(error: string | null | undefined, fallback = 'PumpFun action failed. Nothing was submitted.'): string {
  const raw = error?.trim()
  if (!raw) return fallback

  const text = raw.replace(/\s+/g, ' ')
  const lower = text.toLowerCase()

  if (lower.includes('no keypair') || lower.includes('keypair')) {
    return 'This wallet does not have an imported keypair for PumpFun actions.'
  }

  if (lower.includes('insufficient funds') || lower.includes('insufficient lamports') || lower.includes('insufficient balance')) {
    return 'The wallet does not have enough SOL for the amount, priority fee, and network fees.'
  }

  if (lower.includes('slippage')) {
    return 'The PumpFun trade moved outside the selected slippage. Refresh the curve and try again.'
  }

  if (lower.includes('blockhash') || lower.includes('expired') || lower.includes('transaction too old')) {
    return 'The transaction expired before it landed. Refresh the latest curve state and try again.'
  }

  if (lower.includes('invalid public key') || lower.includes('invalid address') || lower.includes('mint')) {
    return 'The token mint or wallet address is not a valid Solana address.'
  }

  if (lower.includes('simulation') || lower.includes('custom program error')) {
    return `Simulation failed before broadcast. ${text}`
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'The RPC provider rate-limited the PumpFun request. Wait a moment or switch RPC providers.'
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econn') || lower.includes('timeout') || lower.includes('rpc')) {
    return 'DAEMON could not reach the Solana RPC or PumpFun provider. Check the selected network and RPC settings.'
  }

  if (text.length > 180) return `${fallback} ${text.slice(0, 177)}...`
  return text
}

export function shortSignature(signature: string): string {
  if (signature.length <= 20) return signature
  return `${signature.slice(0, 10)}...${signature.slice(-8)}`
}

export async function openPumpfunSignature(signature: string, cluster: WalletInfrastructureSettings['cluster']): Promise<void> {
  if (canOpenSolscan(cluster)) {
    await window.daemon.shell.openExternal(getSolscanTxUrl(signature, cluster))
    return
  }
  await window.daemon.env.copyValue(signature)
}
