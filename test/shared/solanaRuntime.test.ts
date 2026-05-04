import { describe, expect, it } from 'vitest'
import { getSolanaRuntimeBlockers } from '../../electron/shared/solanaRuntime'

describe('solanaRuntime helpers', () => {
  it('filters structured setup blockers by runtime use case', () => {
    expect(getSolanaRuntimeBlockers({
      ready: false,
      checks: [
        {
          id: 'rpc-provider',
          label: 'RPC provider',
          status: 'setup',
          detail: 'RPC missing',
          requiredFor: ['reads', 'sends', 'swaps'],
        },
        {
          id: 'swap-api',
          label: 'Jupiter API',
          status: 'setup',
          detail: 'Jupiter missing',
          requiredFor: ['swaps', 'scaffolds'],
        },
      ],
      blockers: ['RPC missing', 'Jupiter missing'],
    }, 'sends')).toEqual(['RPC missing'])
  })

  it('falls back to legacy runtime summary fields when preflight is absent', () => {
    expect(getSolanaRuntimeBlockers({
      rpc: { label: 'QuickNode', detail: 'QuickNode endpoint missing', status: 'setup' },
      walletPath: { label: 'Phantom-first', detail: 'Wallet ready', status: 'live' },
      swapEngine: { label: 'Jupiter', detail: 'Jupiter missing', status: 'setup' },
      executionBackend: { label: 'Shared RPC executor', detail: 'RPC submitter missing', status: 'setup' },
      executionCoverage: [],
      troubleshooting: [],
    }, 'swaps')).toEqual(['QuickNode endpoint missing', 'Jupiter missing', 'RPC submitter missing'])
  })
})
