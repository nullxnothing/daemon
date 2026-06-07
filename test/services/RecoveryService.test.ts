import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import bs58 from 'bs58'
import { Keypair, PublicKey } from '@solana/web3.js'

const { mockExecuteInstructionsWithReceipt, mockGetConnectionStrict } = vi.hoisted(() => ({
  mockExecuteInstructionsWithReceipt: vi.fn(),
  mockGetConnectionStrict: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

vi.mock('../../electron/services/SolanaService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/services/SolanaService')>()
  return {
    ...actual,
    getConnectionStrict: mockGetConnectionStrict,
    executeInstructionsWithReceipt: mockExecuteInstructionsWithReceipt,
  }
})

import { clearLoadedWallets, executeRecovery, getLoadedCount, loadCsvFile } from '../../electron/services/RecoveryService'

describe('RecoveryService', () => {
  let tempDir: string
  let connection: {
    rpcEndpoint: string
    getParsedTokenAccountsByOwner: ReturnType<typeof vi.fn>
    getBalance: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearLoadedWallets()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-recovery-'))
    connection = {
      rpcEndpoint: 'https://runtime-rpc.test',
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({ context: { slot: 1 }, value: [] }),
      getBalance: vi.fn().mockResolvedValue(0),
    }
    mockGetConnectionStrict.mockReturnValue(connection)
    mockExecuteInstructionsWithReceipt.mockResolvedValue({
      status: 'success',
      stage: 'record',
      signature: 'sig',
      transport: 'rpc',
      cluster: 'devnet',
      provider: 'quicknode',
      signerRoute: 'local-keypair',
      warnings: [],
    })
  })

  afterEach(() => {
    clearLoadedWallets()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('loads wallets from a CSV file and clears them from memory', () => {
    const kp = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(csvPath, `privateKey\n${bs58.encode(kp.secretKey)}\n`, 'utf8')

    const result = loadCsvFile(csvPath)

    expect(result.count).toBe(1)
    expect(getLoadedCount()).toBe(1)

    clearLoadedWallets()
    expect(getLoadedCount()).toBe(0)
  })

  it('rejects recovery when no wallets are loaded', async () => {
    await expect(executeRecovery('So11111111111111111111111111111111111111112', null)).rejects.toThrow('No wallets loaded')
  })

  it('rejects recovery when the selected master wallet keypair is not loaded', async () => {
    const kp = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(csvPath, `privateKey\n${bs58.encode(kp.secretKey)}\n`, 'utf8')
    loadCsvFile(csvPath)

    await expect(executeRecovery('So11111111111111111111111111111111111111112', null)).rejects.toThrow('Master wallet keypair not found in loaded wallets')
  })

  it('estimates SOL sweep priority fees against the source wallet account', async () => {
    const master = Keypair.generate()
    const source = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(
      csvPath,
      `privateKey\n${bs58.encode(master.secretKey)}\n${bs58.encode(source.secretKey)}\n`,
      'utf8',
    )
    loadCsvFile(csvPath)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({ result: { priorityFeeEstimate: 111_000 } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ result: { priorityFeeEstimate: 222_000 } }),
      })
    vi.stubGlobal('fetch', fetchMock)

    connection.getBalance.mockResolvedValue(1_000_000)

    try {
      await executeRecovery(master.publicKey.toBase58(), null)

      expect(mockGetConnectionStrict).toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const solFeeBody = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(solFeeBody.params[0].accountKeys).toEqual([source.publicKey.toBase58()])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('routes SOL recovery through the shared executor with source and master signers', async () => {
    const master = Keypair.generate()
    const source = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(
      csvPath,
      `privateKey\n${bs58.encode(master.secretKey)}\n${bs58.encode(source.secretKey)}\n`,
      'utf8',
    )
    loadCsvFile(csvPath)
    connection.getBalance.mockResolvedValue(1_000_000)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ result: { priorityFeeEstimate: 100_000 } }),
    }))

    try {
      await executeRecovery(master.publicKey.toBase58(), null)

      const sweepCall = mockExecuteInstructionsWithReceipt.mock.calls.find((call) => (
        call[3]?.guardSource === 'recovery:sweep-sol'
      ))
      expect(sweepCall).toBeTruthy()
      expect(sweepCall![0]).toBe(connection)
      expect(sweepCall![2].map((kp: Keypair) => kp.publicKey.toBase58())).toEqual([
        source.publicKey.toBase58(),
        master.publicKey.toBase58(),
      ])
      expect((sweepCall![3].payer as PublicKey).toBase58()).toBe(master.publicKey.toBase58())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not burn non-zero token accounts without explicit approval', async () => {
    const master = Keypair.generate()
    const source = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(
      csvPath,
      `privateKey\n${bs58.encode(master.secretKey)}\n${bs58.encode(source.secretKey)}\n`,
      'utf8',
    )
    loadCsvFile(csvPath)
    connection.getParsedTokenAccountsByOwner.mockResolvedValue({
      context: { slot: 1 },
      value: [{
        pubkey: Keypair.generate().publicKey,
        account: {
          data: {
            parsed: {
              info: {
                mint: Keypair.generate().publicKey.toBase58(),
                tokenAmount: { amount: '5' },
              },
            },
          },
        },
      }],
    })
    const send = vi.fn()
    const win = { webContents: { send } } as any
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ result: { priorityFeeEstimate: 100_000 } }),
    }))

    try {
      await executeRecovery(master.publicKey.toBase58(), win)

      expect(mockExecuteInstructionsWithReceipt).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith('recovery:progress', expect.objectContaining({
        type: 'wallet-error',
        error: expect.stringContaining('non-zero token account'),
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('surfaces executor guard failures in recovery progress', async () => {
    const master = Keypair.generate()
    const source = Keypair.generate()
    const csvPath = path.join(tempDir, 'wallets.csv')
    fs.writeFileSync(
      csvPath,
      `privateKey\n${bs58.encode(master.secretKey)}\n${bs58.encode(source.secretKey)}\n`,
      'utf8',
    )
    loadCsvFile(csvPath)
    connection.getBalance.mockResolvedValue(1_000_000)
    mockExecuteInstructionsWithReceipt.mockResolvedValue({
      status: 'blocked',
      stage: 'guard',
      transport: 'rpc',
      cluster: 'devnet',
      signerRoute: 'local-keypair',
      warnings: [],
      failureReason: 'Signer guard: blocked recovery',
    })
    const send = vi.fn()
    const win = { webContents: { send } } as any
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ result: { priorityFeeEstimate: 100_000 } }),
    }))

    try {
      const result = await executeRecovery(master.publicKey.toBase58(), win)

      expect(result.totalRecovered).toBe(0)
      expect(send).toHaveBeenCalledWith('recovery:progress', expect.objectContaining({
        type: 'wallet-error',
        error: 'Signer guard: blocked recovery',
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
