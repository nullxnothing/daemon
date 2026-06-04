import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from '@solana/spl-token'
import { getConnection } from './SolanaService'
import type { AllowanceState, SubscriptionEnrollment } from '../shared/types'

// Native Solana Subscriptions & Allowances — read-only inspection only.
// DAEMON reads a wallet's existing delegate/cap and native-subscription enrollment here.
// Granting (approve-checked), revoking, and charging all sign transactions and must be added
// behind SignerGuardService + a transaction preview, exactly as SAID registration was deferred.

// Subscriptions Delegation Program (Cantina-audited). Docs-sourced — verify on a Solana
// explorer before wiring any signing flow.
export const SUBSCRIPTIONS_PROGRAM_ID = 'De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44' as const

function toPublicKey(address: string, label: string): PublicKey {
  try {
    const key = new PublicKey(address)
    if (address.length < 32 || address.length > 44) throw new Error('out of range')
    return key
  } catch {
    throw new Error(`Invalid ${label} address`)
  }
}

// Derive the program-controlled Subscription Authority PDA for a (user, mint) pair. Seed layout
// is docs-sourced ["subscription_authority", owner, mint] — re-verify against the program before
// using this PDA in any signing path.
function deriveSubscriptionAuthority(owner: PublicKey, mint: PublicKey): PublicKey {
  const [authority] = PublicKey.findProgramAddressSync(
    [Buffer.from('subscription_authority'), owner.toBuffer(), mint.toBuffer()],
    new PublicKey(SUBSCRIPTIONS_PROGRAM_ID),
  )
  return authority
}

async function readTokenAccount(wallet: string, mint: string): Promise<{
  owner: PublicKey
  mintKey: PublicKey
  tokenAccount: PublicKey
  delegate: string | null
  delegatedAmount: string
  exists: boolean
}> {
  const owner = toPublicKey(wallet, 'wallet')
  const mintKey = toPublicKey(mint, 'mint')
  const tokenAccount = await getAssociatedTokenAddress(mintKey, owner)
  try {
    const account = await getAccount(getConnection(), tokenAccount)
    return {
      owner,
      mintKey,
      tokenAccount,
      delegate: account.delegate ? account.delegate.toBase58() : null,
      delegatedAmount: account.delegatedAmount.toString(),
      exists: true,
    }
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) {
      return { owner, mintKey, tokenAccount, delegate: null, delegatedAmount: '0', exists: false }
    }
    throw err
  }
}

export async function getAllowanceState(wallet: string, mint: string): Promise<AllowanceState> {
  const { tokenAccount, delegate, delegatedAmount, exists } = await readTokenAccount(wallet, mint)
  return {
    wallet,
    mint,
    tokenAccount: tokenAccount.toBase58(),
    delegate,
    delegatedAmount,
    hasDelegate: Boolean(delegate),
    tokenAccountExists: exists,
  }
}

export async function getSubscriptionEnrollment(wallet: string, mint: string): Promise<SubscriptionEnrollment> {
  const { owner, mintKey, tokenAccount, delegate, delegatedAmount, exists } = await readTokenAccount(wallet, mint)
  const subscriptionAuthority = deriveSubscriptionAuthority(owner, mintKey).toBase58()
  return {
    wallet,
    mint,
    subscriptionAuthority,
    tokenAccount: exists ? tokenAccount.toBase58() : null,
    enrolled: delegate === subscriptionAuthority,
    delegatedAmount,
  }
}
