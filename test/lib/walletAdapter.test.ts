// @vitest-environment happy-dom

import { Keypair, SystemProgram, Transaction, VersionedTransaction, TransactionMessage, PublicKey } from '@solana/web3.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectWallet,
  disconnectWallet,
  getActiveProvider,
  getProviders,
  getWalletAdapterState,
  signSerializedTransaction,
  subscribeWalletAdapter,
} from '../../src/lib/walletAdapter'
import {
  getProvider,
  registerProvider,
  setActiveProvider,
} from '../../src/lib/walletAdapter/registry'
import { deserializeTransaction } from '../../src/lib/walletAdapter/serialization'
import type { DaemonWalletProvider, WalletAdapterState } from '../../src/lib/walletAdapter/types'

const payer = Keypair.generate()

function makeProvider(overrides: Partial<DaemonWalletProvider> & Pick<DaemonWalletProvider, 'id'>): DaemonWalletProvider {
  const connected: WalletAdapterState = {
    provider: overrides.id,
    status: 'connected',
    network: 'devnet',
    publicKey: payer.publicKey.toBase58(),
    error: null,
    lastSignature: null,
  }
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    icon: overrides.icon ?? '',
    subtitle: overrides.subtitle ?? '',
    isHighlighted: overrides.isHighlighted ?? false,
    perkTier: overrides.perkTier ?? 'standard',
    isAvailable: overrides.isAvailable ?? (() => true),
    connect: overrides.connect ?? (async () => connected),
    disconnect: overrides.disconnect ?? (async () => ({ ...connected, status: 'idle', publicKey: null })),
    signMessage: overrides.signMessage ?? (async () => ({ publicKey: connected.publicKey!, signature: 'sig', signatureBytes: [] })),
    signSerializedTransaction:
      overrides.signSerializedTransaction
      ?? (async (b64) => ({ publicKey: connected.publicKey!, signedTransactionBase64: b64 })),
  }
}

describe('walletAdapter registry', () => {
  beforeEach(() => {
    setActiveProvider(null)
  })

  it('pre-registers Solflare as the highlighted partner first', () => {
    const providers = getProviders()
    expect(providers[0].id).toBe('solflare')
    expect(providers[0].isHighlighted).toBe(true)
    expect(providers[0].perkTier).toBe('partner')
  })

  it('lists more wallets after the partner', () => {
    const ids = getProviders().map((p) => p.id)
    expect(ids).toContain('phantom')
    expect(ids).toContain('backpack')
    expect(ids.indexOf('solflare')).toBeLessThan(ids.indexOf('phantom'))
  })

  it('connect sets the active provider and dispatches sign to it', async () => {
    const sign = vi.fn(async (b64: string) => ({ publicKey: payer.publicKey.toBase58(), signedTransactionBase64: b64 }))
    registerProvider(makeProvider({ id: 'test-wallet', signSerializedTransaction: sign }))

    await connectWallet('test-wallet', 'devnet')
    expect(getActiveProvider()?.id).toBe('test-wallet')

    await signSerializedTransaction('AAAA')
    expect(sign).toHaveBeenCalledWith('AAAA')
  })

  it('failed connect clears the active provider', async () => {
    registerProvider(makeProvider({
      id: 'flaky',
      connect: async () => { throw new Error('user rejected') },
    }))
    await expect(connectWallet('flaky', 'devnet')).rejects.toThrow('user rejected')
    expect(getActiveProvider()).toBeNull()
  })

  it('signing without an active provider throws', async () => {
    setActiveProvider(null)
    await expect(signSerializedTransaction('AAAA')).rejects.toThrow('Connect a wallet before signing')
  })

  it('disconnect resets state to idle', async () => {
    registerProvider(makeProvider({ id: 'disc' }))
    await connectWallet('disc', 'devnet')
    const state = await disconnectWallet()
    expect(state.status).toBe('idle')
    expect(getActiveProvider()).toBeNull()
  })

  it('subscribers receive the current state immediately', () => {
    const listener = vi.fn()
    const unsub = subscribeWalletAdapter(listener)
    expect(listener).toHaveBeenCalledWith(getWalletAdapterState())
    unsub()
  })

  it('exposes getProvider by id', () => {
    expect(getProvider('solflare')?.name).toBe('Solflare')
    expect(getProvider('nope')).toBeUndefined()
  })
})

describe('walletAdapter serialization', () => {
  it('round-trips a legacy transaction', () => {
    const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: PublicKey.default.toBase58() }).add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
    )
    const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    const parsed = deserializeTransaction(new Uint8Array(bytes))
    expect(parsed).toBeInstanceOf(Transaction)
  })

  it('round-trips a versioned (v0) transaction', () => {
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 })],
    }).compileToV0Message()
    const vtx = new VersionedTransaction(message)
    const bytes = vtx.serialize()
    const parsed = deserializeTransaction(bytes)
    expect(parsed).toBeInstanceOf(VersionedTransaction)
  })
})
