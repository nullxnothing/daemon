// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WalletSwapForm } from '../../src/panels/WalletPanel/WalletSwapForm'

function buildRuntimeStatus(
  overrides: Partial<SolanaRuntimeStatusSummary> = {}
): SolanaRuntimeStatusSummary {
  return {
    rpc: { label: 'Helius', detail: 'Helius key connected', status: 'live' },
    walletPath: { label: 'Phantom-first', detail: 'Phantom flow', status: 'live' },
    swapEngine: { label: 'Jupiter', detail: 'Jupiter key connected', status: 'live' },
    executionBackend: { label: 'Shared RPC executor', detail: 'Shared executor', status: 'live' },
    executionCoverage: [],
    troubleshooting: [],
    preflight: {
      ready: true,
      checks: [],
      blockers: [],
    },
    executionPath: {
      mode: 'rpc',
      label: 'Standard RPC submission',
      detail: 'Helius handles reads, transaction construction, submission, and confirmation.',
      submitter: 'Helius key connected',
      confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
    },
    ...overrides,
  }
}

describe('WalletSwapForm runtime readiness', () => {
  it('blocks quote requests when the runtime says Jupiter is not ready', () => {
    const runtimeStatus = buildRuntimeStatus({
      swapEngine: { label: 'Jupiter', detail: 'Jupiter key missing', status: 'setup' },
      executionBackend: { label: 'Shared RPC executor', detail: 'Shared executor', status: 'partial' },
      troubleshooting: ['Jupiter key missing'],
      preflight: {
        ready: false,
        checks: [
          {
            id: 'swap-api',
            label: 'Jupiter API',
            status: 'setup',
            detail: 'Add a Jupiter API key before requesting quotes or executing swaps.',
            requiredFor: ['swaps', 'scaffolds'],
          },
        ],
        blockers: ['Add a Jupiter API key before requesting quotes or executing swaps.'],
      },
    })

    render(
      <WalletSwapForm
        walletId="wallet-1"
        walletName="Main Wallet"
        holdings={[]}
        executionMode="rpc"
        runtimeStatus={runtimeStatus}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Execution path: Standard RPC submission')).toBeInTheDocument()
    expect(screen.getByText('Add a Jupiter API key before requesting quotes or executing swaps.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get Quote' })).toBeDisabled()
  })

  it('blocks quote requests when the RPC preflight is not ready', () => {
    const runtimeStatus = buildRuntimeStatus({
      rpc: { label: 'QuickNode', detail: 'QuickNode endpoint not set', status: 'setup' },
      preflight: {
        ready: false,
        checks: [
          {
            id: 'rpc-provider',
            label: 'RPC provider',
            status: 'setup',
            detail: 'QuickNode is selected but is missing the configuration DAEMON needs before using that provider.',
            requiredFor: ['reads', 'sends', 'swaps', 'launches', 'recovery', 'scaffolds'],
          },
        ],
        blockers: ['QuickNode is selected but is missing the configuration DAEMON needs before using that provider.'],
      },
    })

    render(
      <WalletSwapForm
        walletId="wallet-1"
        walletName="Main Wallet"
        holdings={[]}
        executionMode="rpc"
        runtimeStatus={runtimeStatus}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('QuickNode is selected but is missing the configuration DAEMON needs before using that provider.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get Quote' })).toBeDisabled()
  })
})
