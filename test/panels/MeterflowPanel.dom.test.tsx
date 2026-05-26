// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MeterflowPanel } from '../../src/panels/Meterflow/MeterflowPanel'

function installDaemonBridge(overrides: Partial<Window['daemon']['meterflow']> = {}) {
  const meterflow = {
    status: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        configured: true,
        keySource: 'secure',
        baseUrl: 'https://www.meterflow.fun/proxy',
        tier: 'pro',
        balanceUsd: 10,
        executionReady: true,
        error: null,
        raw: null,
      },
    }),
    storeApiKey: vi.fn().mockResolvedValue({ ok: true, data: { configured: true, executionReady: true } }),
    deleteApiKey: vi.fn().mockResolvedValue({ ok: true, data: { deleted: true } }),
    overview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: {
          configured: true,
          keySource: 'secure',
          baseUrl: 'https://www.meterflow.fun/proxy',
          tier: 'pro',
          balanceUsd: 10,
          executionReady: true,
          error: null,
          raw: null,
        },
        receipts: [{
          id: 'rcpt_123456789',
          status: 'settled',
          route: '/mcp/token-risk',
          payerWallet: '7Y12wallet9AbC111111111111111111111111',
          amountUsd: 0.006,
          asset: 'USDC',
          txSignature: 'tx_123456789',
          responseStatus: 200,
          createdAt: 1710000000000,
        }],
        meters: [{
          id: 'mtr_1',
          route: '/mcp/token-risk',
          method: 'POST',
          unit: 'request',
          priceUsd: 0.006,
          asset: 'USDC',
          status: 'live',
        }],
        budgets: [],
        agentSessions: [],
        webhooks: [],
        revenue: [{ meterId: 'mtr_1', calls: 12, grossUsd: 0.072 }],
        registrySummary: null,
        errors: [],
        fetchedAt: 123,
      },
    }),
    listReceipts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    ingestReceipt: vi.fn().mockResolvedValue({ ok: true, data: null }),
    createDemoWallet: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        walletId: 'wallet_1',
        address: 'DemoWallet111111111111111111111111111111111',
        name: 'Meterflow Demo Payer',
        walletType: 'agent',
        createdAt: 1710000000000,
        hasKeypair: true,
      },
    }),
    getDemoWallet: vi.fn().mockResolvedValue({ ok: true, data: null }),
    checkDemoWalletReadiness: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        wallet: null,
        ready: false,
        network: 'devnet',
        solBalance: null,
        usdcBalance: null,
        fundingMessage: 'Fund this dedicated demo wallet with a small amount of SOL for fees and enough USDC for x402 payment testing.',
        blockers: ['Create a Meterflow demo wallet first.'],
      },
    }),
    callPaidAgentReadiness: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        wallet: {
          walletId: 'wallet_1',
          address: 'DemoWallet111111111111111111111111111111111',
          name: 'Meterflow Demo Payer',
          walletType: 'agent',
          createdAt: 1710000000000,
          hasKeypair: true,
        },
        idempotencyKey: 'idem_1',
        status: 200,
        ok: true,
        receipt: { id: 'rcpt_paid', status: 'settled', route: '/mcp/agent-readiness' },
        receiptId: 'rcpt_paid',
        receiptUrl: 'https://www.meterflow.fun/receipts/rcpt_paid',
        txSignature: 'tx_paid',
        result: { receipt: { id: 'rcpt_paid' } },
      },
    }),
    watchProject: vi.fn().mockResolvedValue({ ok: true, data: { watching: true } }),
    getReceipt: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        receipt: {
          id: 'rcpt_123456789',
          status: 'settled',
          route: '/mcp/token-risk',
          amountUsd: 0.006,
          asset: 'USDC',
          responseStatus: 200,
        },
        graph: { quote: { amountUsd: 0.006 } },
      },
    }),
    getReceiptGraph: vi.fn().mockResolvedValue({ ok: true, data: { quote: { amountUsd: 0.006 } } }),
    listMeters: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    testMeter: vi.fn().mockResolvedValue({ ok: true, data: { receipt: { id: 'rcpt_test' } } }),
    listBudgets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listAgentSessions: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listWebhooks: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    providerRevenue: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    registrySummary: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    exportReceiptsCsv: vi.fn().mockResolvedValue({
      ok: true,
      data: { filename: 'meterflow-receipts.csv', contentType: 'text/csv', content: 'id\nrcpt_1' },
    }),
    ...overrides,
  }

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      meterflow,
      env: { copyValue: vi.fn().mockResolvedValue({ ok: true }) },
      shell: { openExternal: vi.fn().mockResolvedValue({ ok: true }) },
    },
  })

  return meterflow
}

describe('MeterflowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders setup when no API key is configured and stores a key', async () => {
    const meterflow = installDaemonBridge({
      status: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          configured: false,
          keySource: 'none',
          baseUrl: 'https://www.meterflow.fun/proxy',
          tier: null,
          balanceUsd: null,
          executionReady: false,
          error: null,
          raw: null,
        },
      }),
      overview: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          status: {
            configured: false,
            keySource: 'none',
            baseUrl: 'https://www.meterflow.fun/proxy',
            tier: null,
            balanceUsd: null,
            executionReady: true,
            error: null,
            raw: null,
          },
          receipts: [],
          meters: [],
          budgets: [],
          agentSessions: [],
          webhooks: [],
          revenue: [],
          registrySummary: null,
          errors: [],
          fetchedAt: 123,
        },
      }),
    })

    render(<MeterflowPanel />)

    await userEvent.type(await screen.findByLabelText('Meterflow API key'), 'mf_key')
    await userEvent.click(screen.getByRole('button', { name: /save key/i }))

    expect(meterflow.storeApiKey).toHaveBeenCalledWith('mf_key')
  })

  it('renders live receipts and opens receipt detail', async () => {
    const meterflow = installDaemonBridge()

    render(<MeterflowPanel />)

    expect(await screen.findByText('Payment Ledger')).toBeInTheDocument()
    expect(screen.getByText('/mcp/token-risk')).toBeInTheDocument()
    expect(screen.getAllByText('$0.006').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => {
      expect(meterflow.getReceipt).toHaveBeenCalledWith('rcpt_123456789')
    })
    expect(await screen.findByText(/rcpt_123/)).toBeInTheDocument()
    expect(screen.getByText(/amountUsd/)).toBeInTheDocument()
  })

  it('runs an x402 test from the meter tab', async () => {
    const meterflow = installDaemonBridge()

    render(<MeterflowPanel />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Meters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Test Quote' }))

    await waitFor(() => {
      expect(meterflow.callPaidAgentReadiness).toHaveBeenCalledWith({ agentName: 'DAEMON Meterflow Demo' })
    })
  })
})
