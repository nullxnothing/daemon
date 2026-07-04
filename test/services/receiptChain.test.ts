import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real chain module transitively imports electron `safeStorage` and the
// Solana runtime config; stub both so the module loads under plain Node. The
// devnet guard we are testing throws BEFORE any of these are consulted, so the
// stubs never actually run for the blocked path — their presence just lets the
// module import.
const secureKey = vi.hoisted(() => ({ getKey: vi.fn(() => null) }))
const runtime = vi.hoisted(() => ({
  getKey: vi.fn(),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: secureKey.getKey,
}))

vi.mock('../../electron/services/SolanaRuntimeConfigService', () => ({
  getPublicRpcEndpoint: vi.fn(() => {
    throw new Error('endpoint builder must not run on the blocked path')
  }),
  getHeliusApiKey: vi.fn(() => {
    throw new Error('helius key read must not run on the blocked path')
  }),
  getHeliusRpcEndpoint: vi.fn(() => {
    throw new Error('endpoint builder must not run on the blocked path')
  }),
}))

import { defaultReceiptChain, RECEIPT_SIGNER_KEY_NAME } from '../../electron/services/receipts/receiptChain'

beforeEach(() => {
  vi.clearAllMocks()
  secureKey.getKey.mockReturnValue(null)
})

describe('defaultReceiptChain.anchorMemo — devnet-only invariant at the emit boundary', () => {
  const memo = `DAEMON-RECEIPT v1 sha256=${'a'.repeat(64)}`

  it('refuses mainnet-beta and touches nothing (no signer load, no connection)', async () => {
    await expect(defaultReceiptChain.anchorMemo(memo, 'mainnet-beta')).rejects.toThrow(/devnet-only/)
    // The guard fires before any signer key is read or endpoint is built.
    expect(secureKey.getKey).not.toHaveBeenCalled()
  })

  it('refuses every non-devnet cluster, however it is spelled', async () => {
    for (const cluster of ['mainnet-beta', 'mainnet', 'localnet', 'testnet', 'DEVNET', '', 'unknown']) {
      await expect(defaultReceiptChain.anchorMemo(memo, cluster)).rejects.toThrow(/devnet-only/)
    }
    expect(secureKey.getKey).not.toHaveBeenCalled()
  })

  it('passes the devnet guard, then fails only for the missing signer', async () => {
    // On devnet the guard is satisfied; with no signer provisioned it must stop
    // at the signer check (never reaching the network) — proving the guard order.
    await expect(defaultReceiptChain.anchorMemo(memo, 'devnet')).rejects.toThrow(/No receipt signer/)
    expect(secureKey.getKey).toHaveBeenCalledWith(RECEIPT_SIGNER_KEY_NAME)
  })
})
