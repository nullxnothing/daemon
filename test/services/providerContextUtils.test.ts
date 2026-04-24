import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetSolanaRuntimeStatus, mockGetValidatorState, mockListSolanaActivity } = vi.hoisted(() => ({
  mockGetSolanaRuntimeStatus: vi.fn(),
  mockGetValidatorState: vi.fn(),
  mockListSolanaActivity: vi.fn(),
}))

vi.mock('../../electron/services/SolanaRuntimeStatusService', () => ({
  getSolanaRuntimeStatus: mockGetSolanaRuntimeStatus,
}))

vi.mock('../../electron/services/ValidatorManager', () => ({
  getState: mockGetValidatorState,
}))

vi.mock('../../electron/services/SolanaActivityService', () => ({
  listSolanaActivity: mockListSolanaActivity,
}))

import { buildSolanaRuntimeContext } from '../../electron/services/providers/contextUtils'

describe('provider context utils', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.clearAllMocks()
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('builds project-aware Solana runtime context for agent launches', () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-solana-context-'))
    tempDirs.push(projectPath)
    fs.writeFileSync(path.join(projectPath, 'daemon.solana-runtime.json'), JSON.stringify({
      chain: 'solana',
      executionMode: 'jito',
      swapProvider: 'jupiter',
    }))

    mockGetSolanaRuntimeStatus.mockReturnValue({
      rpc: { label: 'Helius', detail: 'Helius key connected', status: 'live' },
      walletPath: { label: 'Phantom-first', detail: 'Wallet route ready', status: 'live' },
      swapEngine: { label: 'Jupiter', detail: 'Quotes enabled', status: 'live' },
      executionBackend: { label: 'Shared Jito executor', detail: 'Jito active', status: 'live' },
      environmentDiagnostics: [
        { id: 'solana-cli', label: 'Solana CLI', status: 'live', detail: 'solana 2.1.0', action: 'ready' },
      ],
      executionCoverage: [],
      troubleshooting: ['Jito submission is enabled while reads still use public RPC.'],
    })
    mockGetValidatorState.mockReturnValue({
      type: 'surfpool',
      status: 'running',
      terminalId: 'terminal-1',
      port: 8899,
    })
    mockListSolanaActivity.mockReturnValue([
      {
        id: 'activity-1',
        walletId: 'wallet-1',
        kind: 'swap',
        status: 'confirmed',
        provider: 'helius',
        executionMode: 'jito',
        transport: 'jito',
        signature: 'sig',
        title: 'Jupiter swap',
        detail: 'Confirmed Jupiter swap via Jito submission + Helius RPC reads.',
        fromAddress: 'from',
        toAddress: null,
        inputMint: 'sol',
        outputMint: 'usdc',
        inputSymbol: 'SOL',
        outputSymbol: 'USDC',
        inputAmount: 1,
        outputAmount: 150,
        error: null,
        metadataJson: JSON.stringify({ projectId: 'project-1', projectPath }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])

    const context = buildSolanaRuntimeContext({ id: 'project-1', path: projectPath }).join('\n')

    expect(context).toContain('<solana-runtime-context>')
    expect(context).toContain('Project runtime file: present (solana, jito, jupiter)')
    expect(context).toContain('Execution backend: Shared Jito executor')
    expect(context).toContain('Validator: running (surfpool) on localhost:8899')
    expect(context).toContain('Recent Solana activity:')
    expect(context).toContain('Jupiter swap [confirmed]')
  })
})
