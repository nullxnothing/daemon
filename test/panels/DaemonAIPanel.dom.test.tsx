// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DaemonAIPanel } from '../../src/panels/DaemonAI/DaemonAIPanel'
import { useAiStore } from '../../src/store/aiStore'
import { useUIStore } from '../../src/store/ui'
import { METERFLOW_RECEIPT_HANDOFF_KEY } from '../../src/lib/surfaceHandoffs'

function installDaemonBridge() {
  const meterflow = {
    listReceipts: vi.fn().mockResolvedValue({
      ok: true,
      data: [{
        id: 'rcpt_paid',
        status: 'settled',
        route: '/mcp/agent-readiness',
        amountUsd: 0.006,
        asset: 'USDC',
        agentName: 'DAEMON Meterflow Demo',
        txSignature: 'tx_paid',
        createdAt: 1710000000000,
      }],
    }),
  }

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      ai: {
        getUsage: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            plan: 'light',
            accessSource: null,
            monthlyCredits: 0,
            usedCredits: 0,
            remainingCredits: 0,
            resetAt: 0,
          },
        }),
        getFeatures: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            hostedAvailable: false,
            backendConfigured: false,
            cloudTokenPresent: false,
            plan: 'light',
            features: [],
          },
        }),
        getModels: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ lane: 'auto', label: 'Auto', provider: 'local', model: 'local', hosted: false }],
        }),
        listAgentRuns: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listToolApprovals: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listPatchProposals: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        chat: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
        createAgentRun: vi.fn().mockResolvedValue({ ok: false, error: 'not used' }),
      },
      meterflow,
      shell: { openExternal: vi.fn().mockResolvedValue({ ok: true }) },
      settings: { setLayout: vi.fn().mockResolvedValue({ ok: true }) },
    },
  })

  return { meterflow }
}

describe('DaemonAIPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    installDaemonBridge()
    useAiStore.setState({
      messages: [],
      conversationId: null,
      usage: null,
      features: null,
      models: [],
      agentRuns: [],
      approvals: [],
      patchProposals: [],
      loading: false,
      workbenchLoading: false,
      error: null,
      workbenchError: null,
    })
    useUIStore.setState({
      workspaceToolTabs: [],
      activeWorkspaceToolId: null,
      dashboardTabActive: false,
      browserTabActive: false,
    } as any)
  })

  it('surfaces Meterflow paid-call receipts and opens the receipt in Meterflow', async () => {
    render(<DaemonAIPanel />)

    await userEvent.click(await screen.findByRole('tab', { name: /Receipts/ }))

    expect(await screen.findByText('Meterflow paid calls')).toBeInTheDocument()
    expect(screen.getByText('/mcp/agent-readiness')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open in Meterflow' }))

    expect(useUIStore.getState().activeWorkspaceToolId).toBe('meterflow')
    expect(window.localStorage.getItem(METERFLOW_RECEIPT_HANDOFF_KEY)).toContain('rcpt_paid')
  })
})
