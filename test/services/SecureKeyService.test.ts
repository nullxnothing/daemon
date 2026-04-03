import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEncryptString, mockDecryptString, mockIsEncryptionAvailable } = vi.hoisted(() => ({
  mockEncryptString: vi.fn((s: string) => Buffer.from(s)),
  mockDecryptString: vi.fn((b: Buffer) => b.toString()),
  mockIsEncryptionAvailable: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: mockEncryptString,
    decryptString: mockDecryptString,
    isEncryptionAvailable: mockIsEncryptionAvailable,
  },
}))

const mockRun = vi.fn()
const mockGet = vi.fn()
const mockAll = vi.fn()
const mockPrepare = vi.fn()

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

import { storeKey, getKey, deleteKey, listKeys, isEncryptionAvailable } from '../../electron/services/SecureKeyService'

describe('isEncryptionAvailable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when safeStorage reports available', () => {
    mockIsEncryptionAvailable.mockReturnValue(true)
    expect(isEncryptionAvailable()).toBe(true)
  })

  it('returns false when safeStorage reports unavailable', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    expect(isEncryptionAvailable()).toBe(false)
  })
})

describe('storeKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
  })

  it('calls encryptString before storing', () => {
    storeKey('MY_KEY', 'secret-value')
    expect(mockEncryptString).toHaveBeenCalledWith('secret-value')
  })

  it('persists the encrypted buffer via prepare.run', () => {
    const encryptedBuf = Buffer.from('encrypted')
    mockEncryptString.mockReturnValue(encryptedBuf)
    storeKey('MY_KEY', 'secret-value')
    expect(mockRun).toHaveBeenCalled()
    const args = mockRun.mock.calls[0]
    expect(args[0]).toBe('MY_KEY')
    expect(args[1]).toBe(encryptedBuf)
  })

  it('stores hint with last 4 chars for values longer than 4', () => {
    storeKey('API_KEY', 'abcde12345')
    const args = mockRun.mock.calls[0]
    // hint is '...' + last 4 chars
    expect(args[2]).toBe('...2345')
  })

  it('stores masked hint for short values', () => {
    storeKey('SHORT', 'ab')
    const args = mockRun.mock.calls[0]
    expect(args[2]).toBe('****')
  })

  it('throws when encryption is unavailable', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    expect(() => storeKey('KEY', 'value')).toThrow('OS encryption not available')
  })

  it('uses INSERT OR REPLACE SQL', () => {
    storeKey('MY_KEY', 'value')
    const sql = mockPrepare.mock.calls[0][0] as string
    expect(sql).toMatch(/INSERT OR REPLACE/i)
    expect(sql).toContain('secure_keys')
  })
})

describe('getKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEncryptionAvailable.mockReturnValue(true)
  })

  it('returns null when encryption is unavailable', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    const result = getKey('ANY_KEY')
    expect(result).toBeNull()
  })

  it('returns null when key does not exist in DB', () => {
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
    const result = getKey('MISSING_KEY')
    expect(result).toBeNull()
  })

  it('decrypts and returns the stored value', () => {
    const encryptedBuf = Buffer.from('my-secret')
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue({ encrypted_value: encryptedBuf }) })
    mockDecryptString.mockReturnValue('my-secret')
    const result = getKey('MY_KEY')
    expect(mockDecryptString).toHaveBeenCalled()
    expect(result).toBe('my-secret')
  })

  it('round-trips storeKey → getKey correctly', () => {
    let stored: Buffer | null = null
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT OR REPLACE')) {
        return {
          run: (_key: string, encrypted: Buffer) => {
            stored = encrypted
          },
        }
      }
      return {
        get: () => stored ? { encrypted_value: stored } : undefined,
      }
    })
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s + '-enc'))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString().replace('-enc', ''))

    storeKey('ROUND_TRIP', 'hello-world')
    const result = getKey('ROUND_TRIP')
    expect(result).toBe('hello-world')
  })
})

describe('deleteKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepare.mockReturnValue({ run: mockRun })
  })

  it('executes DELETE SQL with the key name', () => {
    deleteKey('MY_KEY')
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM secure_keys'))
    expect(mockRun).toHaveBeenCalledWith('MY_KEY')
  })

  it('does not throw when key does not exist', () => {
    expect(() => deleteKey('NONEXISTENT')).not.toThrow()
  })
})

describe('listKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all key_name and hint rows ordered by key_name', () => {
    const rows = [
      { key_name: 'A_KEY', hint: '...abc' },
      { key_name: 'B_KEY', hint: '****' },
    ]
    mockPrepare.mockReturnValue({ all: vi.fn().mockReturnValue(rows) })
    const result = listKeys()
    expect(result).toEqual(rows)
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY key_name'))
  })

  it('returns empty array when no keys are stored', () => {
    mockPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })
    expect(listKeys()).toEqual([])
  })
})
