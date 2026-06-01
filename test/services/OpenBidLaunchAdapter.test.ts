import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenBidLaunchAdapter } from '../../electron/services/token-launch/adapters/OpenBidLaunchAdapter'

function makeTransactionBase64(payer: Keypair, mint: Keypair): string {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        ],
      }),
    ],
  }).compileToV0Message()
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64')
}

describe('OpenBidLaunchAdapter', () => {
  let imagePath: string
  let payer: Keypair
  let mint: Keypair

  beforeEach(() => {
    payer = Keypair.generate()
    mint = Keypair.generate()
    imagePath = path.join(os.tmpdir(), `openbid-${Date.now()}.png`)
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('is available on devnet with default basedbid config', () => {
    const adapter = createOpenBidLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })

    expect(adapter.definition.enabled).toBe(true)
  })

  it('preflights image, devnet, DEX, and sale defaults', async () => {
    const adapter = createOpenBidLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'openbid',
      walletId: 'wallet-1',
      name: 'based token',
      symbol: 'BID',
      description: 'basedbid launch',
      imagePath,
      initialBuySol: 0.1,
      slippageBps: 1000,
      priorityFeeSol: 0.001,
    })

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openbid-cluster', status: 'pass' }),
      expect.objectContaining({ id: 'openbid-image', status: 'pass' }),
      expect.objectContaining({ id: 'openbid-dex', status: 'pass' }),
      expect.objectContaining({ id: 'openbid-sale', status: 'pass' }),
      expect.objectContaining({ id: 'openbid-initial-buy', status: 'pass' }),
    ]))
  })

  it('rejects Raydium 6% tiers and market caps below the documented basedbid range', async () => {
    const adapter = createOpenBidLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })

    const checks = await adapter.preflight?.({
      launchpad: 'openbid',
      walletId: 'wallet-1',
      name: 'based token',
      symbol: 'BID',
      description: 'basedbid launch',
      imagePath,
      initialBuySol: 0,
      slippageBps: 0,
      priorityFeeSol: 0.001,
      openbid: {
        dex: 'raydium',
        feeTier: '3',
        marketCap: '9000',
      },
    })

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openbid-dex', status: 'fail' }),
      expect.objectContaining({ id: 'openbid-sale', status: 'fail' }),
    ]))
  })

  it('rejects non-local HTTP basedbid API bases', () => {
    expect(() => createOpenBidLaunchAdapter({
      env: { OPENBID_API_BASE_URL: 'http://evil.example/api' } as NodeJS.ProcessEnv,
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })).toThrow(/https/i)
  })

  it('rejects API transactions when the response mint does not match the mint signer', async () => {
    const wrongMint = Keypair.generate()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/upload')) return new Response(JSON.stringify({ response: { url: 'https://ipfs.based.bid/ipfs/logo' } }), { status: 200 })
      if (url.endsWith('/upload/json')) return new Response(JSON.stringify({ response: { url: 'https://ipfs.based.bid/ipfs/meta' } }), { status: 200 })
      if (url.endsWith('/sol/create-lbp')) {
        return new Response(JSON.stringify({
          transaction: makeTransactionBase64(payer, mint),
          mintAddress: wrongMint.publicKey.toBase58(),
          mintSignerSecretHex: Buffer.from(mint.secretKey).toString('hex'),
          lookupTableAddresses: [],
          blockhash: '11111111111111111111111111111111',
          lastValidBlockHeight: 123,
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })

    const adapter = createOpenBidLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      fetchImpl,
      withKeypairImpl: vi.fn(async (_walletId, fn) => fn(payer)),
      getConnectionImpl: vi.fn(() => ({ rpcEndpoint: 'https://api.devnet.solana.com' } as never)),
      executeTransactionImpl: vi.fn(),
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })

    await expect(adapter.createLaunch({
      launchpad: 'openbid',
      walletId: 'wallet-1',
      name: 'based token',
      symbol: 'BID',
      description: 'basedbid launch',
      imagePath,
      initialBuySol: 0,
      slippageBps: 0,
      priorityFeeSol: 0.001,
    })).rejects.toThrow(/mint/i)
  })

  it('uploads metadata, requests an LBP transaction, signs locally, and omits mint secret from receipts', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/upload')) {
        return new Response(JSON.stringify({ response: { url: 'https://ipfs.based.bid/ipfs/logo' } }), { status: 200 })
      }
      if (url.endsWith('/upload/json')) {
        return new Response(JSON.stringify({ response: { url: 'https://ipfs.based.bid/ipfs/meta' } }), { status: 200 })
      }
      if (url.endsWith('/sol/create-lbp')) {
        return new Response(JSON.stringify({
          ok: true,
          chainId: 5011,
          chainSymbol: 'SOL',
          transaction: makeTransactionBase64(payer, mint),
          mintAddress: mint.publicKey.toBase58(),
          mintSignerSecretHex: Buffer.from(mint.secretKey).toString('hex'),
          lookupTableAddresses: [],
          blockhash: '11111111111111111111111111111111',
          lastValidBlockHeight: 123,
          metadataUrl: 'https://ipfs.based.bid/ipfs/meta',
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    const executeTransactionImpl = vi.fn(async () => ({
      signature: 'openbid-sig-123',
      transport: 'rpc' as const,
    }))

    const adapter = createOpenBidLaunchAdapter({
      env: {} as NodeJS.ProcessEnv,
      fetchImpl,
      withKeypairImpl: vi.fn(async (_walletId, fn) => fn(payer)),
      getConnectionImpl: vi.fn(() => ({ rpcEndpoint: 'https://api.devnet.solana.com' } as never)),
      executeTransactionImpl,
      getWalletInfrastructureSettingsImpl: () => ({
        cluster: 'devnet',
        rpcProvider: 'public',
        quicknodeRpcUrl: '',
        customRpcUrl: '',
        swapProvider: 'jupiter',
        preferredWallet: 'phantom',
        executionMode: 'rpc',
        jitoBlockEngineUrl: '',
      }),
    })

    const result = await adapter.createLaunch({
      launchpad: 'openbid',
      walletId: 'wallet-1',
      name: 'based token',
      symbol: 'BID',
      description: 'basedbid launch',
      imagePath,
      initialBuySol: 0,
      slippageBps: 0,
      priorityFeeSol: 0.001,
      openbid: {
        initialBuyPercent: 7.5,
      },
    })

    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/sol/create-lbp'), expect.objectContaining({
      method: 'POST',
    }))
    expect(JSON.parse((fetchImpl.mock.calls.find(([input]) => input.toString().endsWith('/sol/create-lbp'))?.[1] as RequestInit).body as string)).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          token: expect.objectContaining({ initialBuyAmount: '7.5' }),
          sale: expect.objectContaining({ initialBuyAmount: '7.5' }),
        }),
      }),
    )
    expect(executeTransactionImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(VersionedTransaction),
      expect.arrayContaining([payer, expect.any(Keypair)]),
      expect.objectContaining({
        confirmationStrategy: expect.objectContaining({ lastValidBlockHeight: 123 }),
      }),
    )
    expect(result.signature).toBe('openbid-sig-123')
    expect(result.mint).toBe(mint.publicKey.toBase58())
    expect(JSON.stringify(result.protocolReceipts)).not.toContain('mintSignerSecretHex')
  })
})
