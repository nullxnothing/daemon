// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WalletSendForm } from '../../src/panels/WalletPanel/WalletSendForm'

describe('WalletSendForm runtime readiness', () => {
  it('blocks send confirmation when the send preflight is not ready', () => {
    const runtimeStatus: SolanaRuntimeStatusSummary = {
      rpc: { label: 'QuickNode', detail: 'QuickNode endpoint not set', status: 'setup' },
      walletPath: { label: 'Phantom-first', detail: 'Phantom flow', status: 'live' },
      swapEngine: { label: 'Jupiter', detail: 'Jupiter key connected', status: 'live' },
      executionBackend: { label: 'Shared RPC executor', detail: 'QuickNode is selected for submission, but the RPC provider is not configured.', status: 'setup' },
      executionCoverage: [],
      troubleshooting: ['QuickNode endpoint missing'],
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
      executionPath: {
        mode: 'rpc',
        label: 'Standard RPC submission',
        detail: 'QuickNode handles reads, transaction construction, submission, and confirmation.',
        submitter: 'QuickNode endpoint not set',
        confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
      },
    }

    render(
      <WalletSendForm
        walletId="wallet-1"
        walletName="Main Wallet"
        sendMode="sol"
        sendDest=""
        sendAmount=""
        sendMint=""
        sendMax={false}
        selectedRecipientWalletId=""
        recipientWallets={[]}
        tokenOptions={[]}
        walletBalanceSol={1}
        executionMode="rpc"
        runtimeStatus={runtimeStatus}
        sendLoading={false}
        sendError={null}
        sendResult={null}
        pendingSend={null}
        onRecipientWalletChange={vi.fn()}
        onDestChange={vi.fn()}
        onAmountChange={vi.fn()}
        onMintChange={vi.fn()}
        onToggleSendMax={vi.fn()}
        onConfirmSend={vi.fn()}
        onExecuteSend={vi.fn()}
        onCancelSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('QuickNode is selected but is missing the configuration DAEMON needs before using that provider.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Send' })).toBeDisabled()
  })
})
