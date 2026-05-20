export function getClusterDisplayName(cluster: WalletInfrastructureSettings['cluster'] | string | null | undefined): string {
  if (cluster === 'mainnet-beta' || cluster === 'mainnet') return 'Mainnet'
  if (cluster === 'devnet') return 'Devnet'
  if (cluster === 'localnet') return 'Localnet'
  if (cluster === 'testnet') return 'Testnet'
  return cluster ? String(cluster) : 'Unknown network'
}

export function getExecutionModeDisplayName(mode: WalletInfrastructureSettings['executionMode'] | string | null | undefined): string {
  if (mode === 'jito') return 'Jito block engine'
  return 'Standard RPC'
}

export function describeWalletActionError(error: string | null | undefined, fallback = 'The wallet action failed.'): string {
  const raw = error?.trim()
  if (!raw) return fallback

  const text = raw.replace(/\s+/g, ' ')
  const lower = text.toLowerCase()

  if (lower.includes('user rejected') || lower.includes('rejected') || lower.includes('denied')) {
    return 'The wallet did not sign. Nothing was sent.'
  }

  if (lower.includes('insufficient funds') || lower.includes('insufficient lamports') || lower.includes('insufficient balance')) {
    return 'The wallet does not have enough balance for the amount plus network fees.'
  }

  if (lower.includes('blockhash') || lower.includes('expired') || lower.includes('transaction too old')) {
    return 'The transaction expired before it landed. Refresh the quote or try again.'
  }

  if (lower.includes('invalid public key') || lower.includes('invalid address') || lower.includes('address must be')) {
    return 'One of the addresses is not a valid Solana address.'
  }

  if (lower.includes('simulation') || lower.includes('custom program error')) {
    return `Simulation failed before broadcast. ${text}`
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'The RPC provider rate-limited the request. Wait a moment or switch RPC providers.'
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econn') || lower.includes('timeout')) {
    return 'DAEMON could not reach the Solana RPC or provider. Check the selected network and RPC settings.'
  }

  if (text.length > 180) return `The wallet action failed. ${text.slice(0, 177)}...`
  return text
}

export function buildPreviewUnavailableWarning(error: string | null | undefined): string {
  return `Safety preview did not load: ${describeWalletActionError(error, 'DAEMON could not prepare the preview.')} Verify signer, network, amount, and recipient before signing.`
}
