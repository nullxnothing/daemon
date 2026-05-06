import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import bs58 from 'bs58'
import { Connection, Keypair } from '@solana/web3.js'

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
    getHeliusApiKey: vi.fn(() => 'test-helius-key'),
    executeTransaction: vi.fn().mockResolvedValue({ signature: 'sig', transport: 'rpc' }),
  }
})

import { clearLoadedWallets, executeRecovery, getLoadedCount, loadCsvFile } from '../../electron/services/RecoveryService'

describe('RecoveryService', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    clearLoadedWallets()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-recovery-'))
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

    const tokenAccountsSpy = vi.spyOn(Connection.prototype, 'getParsedTokenAccountsByOwner')
      .mockResolvedValue({ context: { slot: 1 }, value: [] })
    const balanceSpy = vi.spyOn(Connection.prototype, 'getBalance')
      .mockResolvedValue(1_000_000)
    const blockhashSpy = vi.spyOn(Connection.prototype, 'getLatestBlockhash')
      .mockResolvedValue({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 123,
      })

    try {
      await executeRecovery(master.publicKey.toBase58(), null)

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const solFeeBody = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(solFeeBody.params[0].accountKeys).toEqual([source.publicKey.toBase58()])
    } finally {
      tokenAccountsSpy.mockRestore()
      balanceSpy.mockRestore()
      blockhashSpy.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
