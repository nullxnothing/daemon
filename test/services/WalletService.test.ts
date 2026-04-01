import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock electron (not used by WalletService directly, but transitive deps may load it)
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
  safeStorage: { encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}))

// --- DB mock setup
const mockRun = vi.fn()
const mockGet = vi.fn()
const mockAll = vi.fn()
const mockPrepare = vi.fn()

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

// --- SecureKeyService mock
vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

// Suppress real fetch calls - wallet service uses fetch for market data / helius
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: false,
  status: 503,
  statusText: 'Unavailable',
  headers: { get: () => null },
  json: async () => ({}),
}))

import { createWallet, deleteWallet, setDefaultWallet } from '../../electron/services/WalletService'

// Helper to create a controlled prepare mock for a sequence of SQL calls
function createPrepareChain(responses: Record<string, { run?: ReturnType<typeof vi.fn>; get?: ReturnType<typeof vi.fn>; all?: ReturnType<typeof vi.fn> }>) {
  return (sql: string) => {
    for (const [fragment, fns] of Object.entries(responses)) {
      if (sql.includes(fragment)) {
        return {
          run: fns.run ?? vi.fn(),
          get: fns.get ?? vi.fn(),
          all: fns.all ?? vi.fn(),
        }
      }
    }
    return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
  }
}

describe('isValidSolanaAddress (via createWallet)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws on address shorter than 32 chars', () => {
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    expect(() => createWallet('Test', 'short')).toThrow('Invalid Solana wallet address')
  })

  it('throws on address longer than 44 chars', () => {
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    const tooLong = '1'.repeat(45)
    expect(() => createWallet('Test', tooLong)).toThrow('Invalid Solana wallet address')
  })

  it('throws when address contains invalid base58 chars (0, O, I, l)', () => {
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    // Contains '0' which is not in base58 alphabet
    const withZero = '0'.repeat(32)
    expect(() => createWallet('Test', withZero)).toThrow('Invalid Solana wallet address')
  })

  it('throws for empty name', () => {
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    expect(() => createWallet('', '11111111111111111111111111111111')).toThrow('Wallet name is required')
  })

  it('accepts a valid 32-char base58 address (all 1s = valid base58 chars)', () => {
    // All '1's: each maps to digit 0 in base58, result is 32 zero-bytes → valid 32-byte key
    // Known valid Solana system program address (43 chars, valid base58, 32-byte key)
    const validAddress = 'So11111111111111111111111111111111111111112'
    const insertRun = vi.fn()
    const selectGet = vi.fn().mockReturnValue({
      id: 'uuid-1', name: 'Test', address: validAddress, is_default: 1, created_at: Date.now(),
    })

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM wallets WHERE is_default')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO wallets')) return { run: insertRun }
      if (sql.includes('FROM wallets WHERE id')) return { get: selectGet }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    const result = createWallet('Test', validAddress)
    expect(result).toBeDefined()
    expect(insertRun).toHaveBeenCalled()
  })
})

describe('createWallet — is_default logic', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets is_default=1 when no existing default wallet', () => {
    const insertRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM wallets WHERE is_default')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO wallets')) return { run: insertRun }
      if (sql.includes('FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ id: 'x' }) }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    createWallet('First', 'So11111111111111111111111111111111111111112')

    // Fourth argument to run() is is_default value
    const callArgs = insertRun.mock.calls[0]
    // run(id, name, address, is_default, created_at)
    expect(callArgs[3]).toBe(1)
  })

  it('sets is_default=0 when a default wallet already exists', () => {
    const insertRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM wallets WHERE is_default')) return { get: vi.fn().mockReturnValue({ id: 'existing-id' }) }
      if (sql.includes('INSERT INTO wallets')) return { run: insertRun }
      if (sql.includes('FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ id: 'y' }) }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    createWallet('Second', 'So11111111111111111111111111111111111111112')

    const callArgs = insertRun.mock.calls[0]
    expect(callArgs[3]).toBe(0)
  })
})

describe('deleteWallet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('promotes next wallet to default when deleting the default wallet', () => {
    const updateRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT is_default FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ is_default: 1 }) }
      if (sql.includes('UPDATE projects SET wallet_id = NULL')) return { run: vi.fn() }
      if (sql.includes('DELETE FROM wallets')) return { run: vi.fn() }
      if (sql.includes('SELECT id FROM wallets ORDER BY created_at')) return { get: vi.fn().mockReturnValue({ id: 'next-wallet-id' }) }
      if (sql.includes('UPDATE wallets SET is_default = 1')) return { run: updateRun }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    deleteWallet('wallet-to-delete')

    expect(updateRun).toHaveBeenCalledWith('next-wallet-id')
  })

  it('does not promote any wallet when deleting a non-default wallet', () => {
    const updateDefaultRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT is_default FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ is_default: 0 }) }
      if (sql.includes('UPDATE projects SET wallet_id = NULL')) return { run: vi.fn() }
      if (sql.includes('DELETE FROM wallets')) return { run: vi.fn() }
      if (sql.includes('UPDATE wallets SET is_default = 1')) return { run: updateDefaultRun }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    deleteWallet('non-default-wallet')

    expect(updateDefaultRun).not.toHaveBeenCalled()
  })

  it('clears wallet_id from projects that referenced the deleted wallet', () => {
    const clearProjectsRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT is_default FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ is_default: 0 }) }
      if (sql.includes('UPDATE projects SET wallet_id = NULL')) return { run: clearProjectsRun }
      if (sql.includes('DELETE FROM wallets')) return { run: vi.fn() }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    deleteWallet('wallet-123')

    expect(clearProjectsRun).toHaveBeenCalledWith('wallet-123')
  })

  it('does not promote when no replacement wallet exists', () => {
    const updateDefaultRun = vi.fn()

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT is_default FROM wallets WHERE id')) return { get: vi.fn().mockReturnValue({ is_default: 1 }) }
      if (sql.includes('UPDATE projects SET wallet_id = NULL')) return { run: vi.fn() }
      if (sql.includes('DELETE FROM wallets')) return { run: vi.fn() }
      if (sql.includes('SELECT id FROM wallets ORDER BY created_at')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('UPDATE wallets SET is_default = 1')) return { run: updateDefaultRun }
      return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
    })

    deleteWallet('last-wallet')

    expect(updateDefaultRun).not.toHaveBeenCalled()
  })
})
