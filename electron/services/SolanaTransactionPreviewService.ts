import { PublicKey } from '@solana/web3.js'
import type { SolanaTransactionPreview, SolanaTransactionPreviewInput } from '../shared/types'
import { getSolanaRuntimeStatus } from './SolanaRuntimeStatusService'
import { listWallets } from './WalletService'

function shortAddress(value: string | undefined): string {
  if (!value) return 'Not set'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function isLikelySolanaAddress(value: string | undefined): boolean {
  if (!value) return false
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

function formatAmount(value: string | number | undefined): string {
  if (value == null || value === '') return 'Not set'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Invalid amount'
  return value
}

function getWalletLabel(walletId: string | undefined): string {
  if (!walletId) return 'Wallet not selected'
  const wallet = listWallets().find((entry) => entry.id === walletId)
  return wallet ? `${wallet.name} (${shortAddress(wallet.address)})` : `Unknown wallet (${shortAddress(walletId)})`
}

export function previewSolanaTransaction(input: SolanaTransactionPreviewInput): SolanaTransactionPreview {
  const runtime = getSolanaRuntimeStatus()
  const signerLabel = getWalletLabel(input.walletId)
  const warnings = [...runtime.troubleshooting]
  const notes: string[] = [
    `Execution backend: ${runtime.executionBackend.label}.`,
    'Network fees are finalized when DAEMON builds and submits the transaction.',
  ]
  let title = 'Review Transaction'
  let targetLabel = 'Not set'
  let amountLabel = 'Not set'
  let requiresAcknowledgement = false
  let acknowledgementLabel: string | null = null

  if (input.walletId && signerLabel.startsWith('Unknown wallet')) {
    warnings.push('The selected wallet was not found in DAEMON wallet storage.')
  }

  switch (input.kind) {
    case 'send-sol': {
      title = 'Review SOL Send'
      targetLabel = shortAddress(input.destination)
      amountLabel = input.sendMax ? 'Max SOL' : `${formatAmount(input.amount)} SOL`
      if (!isLikelySolanaAddress(input.destination)) {
        warnings.push('Recipient is not a valid Solana address.')
      }
      notes.push('SOL sends use the shared DAEMON wallet-send executor.')
      break
    }
    case 'send-token': {
      const symbol = input.tokenSymbol || shortAddress(input.mint)
      title = `Review ${symbol} Send`
      targetLabel = shortAddress(input.destination)
      amountLabel = input.sendMax ? `Max ${symbol}` : `${formatAmount(input.amount)} ${symbol}`
      if (!isLikelySolanaAddress(input.destination)) {
        warnings.push('Recipient is not a valid Solana address.')
      }
      if (!isLikelySolanaAddress(input.mint)) {
        warnings.push('Token mint is not a valid Solana address.')
      }
      notes.push('If the recipient does not have the token account yet, DAEMON will create it when needed.')
      break
    }
    case 'swap': {
      const inputSymbol = input.inputSymbol || shortAddress(input.inputMint)
      const outputSymbol = input.outputSymbol || shortAddress(input.outputMint)
      const impactPct = Number.parseFloat(String(input.priceImpactPct ?? '0'))
      title = 'Review Swap'
      targetLabel = `${inputSymbol} -> ${outputSymbol}`
      amountLabel = `${formatAmount(input.inputAmount ?? input.amount)} ${inputSymbol} -> ${formatAmount(input.outputAmount)} ${outputSymbol}`
      notes.push(`Slippage: ${((input.slippageBps ?? 0) / 100).toFixed(2)}%.`)
      notes.push('Use the quote quickly; stale quotes should be refreshed before execution.')
      if (runtime.swapEngine.status !== 'live') {
        warnings.push(runtime.swapEngine.detail)
      }
      if (Number.isFinite(impactPct) && impactPct >= 5) {
        requiresAcknowledgement = true
        acknowledgementLabel = 'I understand this swap has very high price impact.'
        warnings.push(`Very high price impact: ${impactPct.toFixed(3)}%.`)
      } else if (Number.isFinite(impactPct) && impactPct >= 1) {
        warnings.push(`High price impact: ${impactPct.toFixed(3)}%.`)
      }
      break
    }
    case 'launch': {
      const protocol = input.protocol || 'Launch adapter'
      title = `Review ${protocol} Launch`
      targetLabel = protocol
      amountLabel = input.tokenSymbol || input.mint || 'Token launch'
      notes.push('Launch flows use DAEMON protocol adapters and the shared transaction executor.')
      requiresAcknowledgement = true
      acknowledgementLabel = 'I reviewed this token launch configuration.'
      break
    }
  }

  return {
    title,
    backendLabel: runtime.executionBackend.label,
    signerLabel,
    targetLabel,
    amountLabel,
    feeLabel: runtime.executionBackend.label.includes('Jito') ? 'Jito + network fees at submit time' : 'RPC network fee at submit time',
    notes,
    warnings,
    requiresAcknowledgement,
    acknowledgementLabel,
  }
}
