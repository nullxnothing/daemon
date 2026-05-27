// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LaunchWizard } from '../../src/panels/LaunchWizard/LaunchWizard'
import { useUIStore } from '../../src/store/ui'
import { useWorkflowShellStore } from '../../src/store/workflowShell'

function ok<T>(data: T) {
  return { ok: true, data }
}

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      launch: {
        listWalletOptions: vi.fn().mockResolvedValue(ok([
          {
            id: 'wallet-1',
            name: 'Main Wallet',
            address: '7Y12wallet9AbC',
            isDefault: true,
            walletType: 'generated',
            ecosystemRole: null,
            hasKeypair: true,
            isAssignedToActiveProject: true,
            assignedProjectIds: ['project-1'],
          },
        ])),
        listLaunchpads: vi.fn().mockResolvedValue(ok([
          { id: 'pumpfun', name: 'Pump.fun', description: 'Bonding curve launches', status: 'live', enabled: true, reason: null },
          { id: 'openbid', name: 'basedbid', description: 'basedbid Pool/LBP launches', status: 'live', enabled: true, reason: null },
        ])),
        pickImage: vi.fn().mockResolvedValue(ok(null)),
        preflightToken: vi.fn().mockResolvedValue(ok({ ready: true, estimatedTotalSol: 0.025, walletBalanceSol: 2.5, checks: [] })),
        createToken: vi.fn().mockResolvedValue(ok({ mint: 'mint', signature: 'sig', metadataUri: null, poolAddress: null, bondingCurveAddress: null })),
        ensureDaemonDeployerWallet: vi.fn(),
      },
      settings: {
        getWalletInfrastructureSettings: vi.fn().mockResolvedValue(ok({
          cluster: 'devnet',
          rpcProvider: 'helius',
          quicknodeRpcUrl: '',
          customRpcUrl: '',
          swapProvider: 'jupiter',
          preferredWallet: 'wallet-standard',
          executionMode: 'rpc',
          jitoBlockEngineUrl: '',
        })),
      },
      wallet: {
        balance: vi.fn().mockResolvedValue(ok({ sol: 2.5, lamports: 2500000000 })),
      },
      fs: {
        readImageBase64: vi.fn().mockResolvedValue(ok({ dataUrl: 'data:image/png;base64,AA==' })),
      },
      pumpfun: {
        importKeypair: vi.fn().mockResolvedValue(ok(true)),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue(ok(true)),
      },
    },
  })
}

describe('LaunchWizard basedbid integration', () => {
  beforeEach(() => {
    installDaemonBridge()
    useWorkflowShellStore.setState({
      drawerTool: null,
      drawerOpen: false,
      drawerFullscreen: false,
      launchWizardOpen: true,
    })
    useUIStore.setState({
      activeProjectId: 'project-1',
      activeProjectPath: 'C:/work/daemon-app',
      projects: [{ id: 'project-1', name: 'daemon-app', path: 'C:/work/daemon-app' } as Project],
    })
  })

  it('uses basedbid branding and docs-aligned Pool/LBP defaults', async () => {
    const user = userEvent.setup()

    render(<LaunchWizard />)

    await user.type(screen.getByPlaceholderText('e.g. Memecoin Energy'), 'Based Test')
    await user.type(screen.getByPlaceholderText('MEME'), 'BID')
    await user.type(screen.getByPlaceholderText('One or two sentences. Keep it tight.'), 'Docs-aligned basedbid launch.')
    await user.click(screen.getByRole('button', { name: /Continue/i }))

    await user.click(await screen.findByRole('button', { name: /basedbid/i }))

    expect(screen.getByAltText('basedbid')).toBeInTheDocument()
    expect(screen.getByText('basedbid pool')).toBeInTheDocument()
    expect(screen.getByText('$11K to $10M')).toBeInTheDocument()
    expect(screen.getByDisplayValue('11000')).toBeInTheDocument()
    expect(screen.getByText('% of supply')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.1')).toBeInTheDocument()
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('$49')).toBeInTheDocument()
    expect(screen.getByText('$99')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '6%' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Raydium' }))

    expect(screen.queryByRole('radio', { name: '6%' })).not.toBeInTheDocument()
  })
})
