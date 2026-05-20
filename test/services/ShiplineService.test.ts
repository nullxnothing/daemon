import { describe, expect, it, vi } from 'vitest'
import type { SolanaProjectInfo } from '../../electron/services/SolanaDetector'
import type { ShiplineRun } from '../../electron/shared/types'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../electron/shared/pathValidation', () => ({
  isPathSafe: vi.fn(() => true),
}))

import { getDb } from '../../electron/db/db'
import { applyShiplineStepUpdate, buildShiplineRun, completeRunningStepForTerminal } from '../../electron/services/ShiplineService'

const PROGRAM_ID = 'ShipLine1111111111111111111111111111111111'

function rowFromRun(run: ShiplineRun) {
  return {
    id: run.id,
    project_id: run.projectId,
    project_path: run.projectPath,
    project_name: run.projectName,
    cluster: run.cluster,
    status: run.status,
    current_step: run.currentStep,
    summary: run.summary,
    warnings_json: JSON.stringify(run.warnings),
    recovery_json: JSON.stringify(run.recovery),
    programs_json: JSON.stringify(run.programs),
    steps_json: JSON.stringify(run.steps),
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  }
}

function readyAnchorProject(): SolanaProjectInfo {
  return {
    isSolanaProject: true,
    framework: 'anchor',
    indicators: ['Anchor.toml', 'programs/ directory'],
    suggestedMcps: ['solana-mcp-server'],
    diagnostics: {
      status: 'ready',
      issueCount: 0,
      programCount: 1,
      checks: [
        {
          id: 'anchor-toml',
          label: 'Anchor.toml',
          status: 'ready',
          detail: 'Anchor.toml detected.',
        },
      ],
      programs: [
        {
          name: 'shipline_counter',
          anchorProgramId: PROGRAM_ID,
          declareId: PROGRAM_ID,
          idlAddress: PROGRAM_ID,
          keypairAddress: PROGRAM_ID,
          checks: [
            {
              id: 'declare-id',
              label: 'declare_id!',
              status: 'ready',
              detail: 'declare_id! matches Anchor.toml.',
            },
            {
              id: 'idl-address',
              label: 'IDL address',
              status: 'ready',
              detail: 'IDL address matches Anchor.toml.',
            },
            {
              id: 'deploy-keypair',
              label: 'Deploy keypair',
              status: 'ready',
              detail: 'Deploy keypair matches Anchor.toml.',
            },
          ],
        },
      ],
    },
  }
}

describe('ShiplineService timeline builder', () => {
  it('creates a devnet Anchor timeline with deploy, verification, and IDL commands', () => {
    const run = buildShiplineRun({
      id: 'run-1',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'devnet',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })

    expect(run.status).toBe('ready')
    expect(run.programs[0].preferredProgramId).toBe(PROGRAM_ID)
    expect(run.programs[0].explorerUrl).toContain('?cluster=devnet')
    expect(run.steps.find((step) => step.id === 'deploy')?.command).toBe('anchor deploy --provider.cluster devnet')
    expect(run.steps.find((step) => step.id === 'confirm')?.command).toBe(`solana program show ${PROGRAM_ID} --url devnet`)
    expect(run.steps.find((step) => step.id === 'idl-export')?.command).toContain('anchor idl fetch')
  })

  it('keeps mainnet-beta execution blocked in the first timeline slice', () => {
    const run = buildShiplineRun({
      id: 'run-2',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'mainnet-beta',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })

    const deploy = run.steps.find((step) => step.id === 'deploy')

    expect(run.status).toBe('blocked')
    expect(deploy?.status).toBe('blocked')
    expect(deploy?.command).toBeNull()
    expect(run.warnings).toContain('Mainnet-beta Shipline execution is blocked in this first timeline slice. Use devnet until policy and signing approvals are wired.')
  })

  it('marks a command step as running with the terminal session attached', () => {
    const run = buildShiplineRun({
      id: 'run-3',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'devnet',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })

    const updated = applyShiplineStepUpdate(run, {
      stepId: 'deploy',
      status: 'running',
      terminalId: 'terminal-1',
      now: 200,
    })
    const deploy = updated.steps.find((step) => step.id === 'deploy')

    expect(updated.status).toBe('running')
    expect(updated.currentStep).toBe('deploy')
    expect(updated.updatedAt).toBe(200)
    expect(deploy?.terminalId).toBe('terminal-1')
    expect(deploy?.startedAt).toBe(200)
    expect(deploy?.completedAt).toBeNull()
    expect(deploy?.artifacts).toContainEqual({ label: 'Terminal', value: 'terminal-1' })
    expect(deploy?.artifacts).toContainEqual({ label: 'Command', value: 'anchor deploy --provider.cluster devnet' })
  })

  it('releases the confirmation step after deploy is marked complete', () => {
    const run = buildShiplineRun({
      id: 'run-4',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'devnet',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })

    const running = applyShiplineStepUpdate(run, {
      stepId: 'deploy',
      status: 'running',
      terminalId: 'terminal-1',
      now: 200,
    })
    const complete = applyShiplineStepUpdate(running, {
      stepId: 'deploy',
      status: 'complete',
      now: 300,
    })
    const deploy = complete.steps.find((step) => step.id === 'deploy')
    const confirm = complete.steps.find((step) => step.id === 'confirm')

    expect(complete.status).toBe('ready')
    expect(deploy?.completedAt).toBe(300)
    expect(confirm?.status).toBe('ready')
  })

  it('completes a running step from terminal exit and persists exit evidence', () => {
    const run = buildShiplineRun({
      id: 'run-5',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'devnet',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })
    const running = applyShiplineStepUpdate(run, {
      stepId: 'deploy',
      status: 'running',
      terminalId: 'terminal-1',
      now: 200,
    })
    const updateRun = vi.fn()
    const selectAll = vi.fn(() => [rowFromRun(running)])
    vi.mocked(getDb).mockReturnValue({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT')) return { all: selectAll }
        return { run: updateRun }
      }),
    } as never)

    const complete = completeRunningStepForTerminal('terminal-1', 0)
    const deploy = complete?.steps.find((step) => step.id === 'deploy')
    const confirm = complete?.steps.find((step) => step.id === 'confirm')

    expect(complete?.status).toBe('ready')
    expect(deploy?.status).toBe('complete')
    expect(deploy?.artifacts).toContainEqual({ label: 'Exit code', value: '0' })
    expect(confirm?.status).toBe('ready')
    expect(updateRun).toHaveBeenCalledTimes(1)
  })

  it('parses solana program show output into verification evidence', () => {
    const run = buildShiplineRun({
      id: 'run-6',
      projectId: 'project-1',
      projectPath: 'C:/work/shipline',
      projectName: 'shipline',
      cluster: 'devnet',
      projectInfo: readyAnchorProject(),
      createdAt: 100,
      updatedAt: 100,
    })
    const running = applyShiplineStepUpdate(run, {
      stepId: 'confirm',
      status: 'running',
      terminalId: 'terminal-verify',
      now: 200,
    })
    const updateRun = vi.fn()
    vi.mocked(getDb).mockReturnValue({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT')) return { all: vi.fn(() => [rowFromRun(running)]) }
        return { run: updateRun }
      }),
    } as never)

    const output = [
      `Program Id: ${PROGRAM_ID}`,
      'Owner: BPFLoaderUpgradeab1e11111111111111111111111',
      'Executable: true',
      'ProgramData Address: Data1111111111111111111111111111111111',
      'Authority: Auth1111111111111111111111111111111111',
      'Last Deployed In Slot: 12345',
      'Data Length: 4096 (0x1000) bytes',
      'Balance: 1.234 SOL',
    ].join('\r\n')

    const complete = completeRunningStepForTerminal('terminal-verify', 0, output)
    const confirm = complete?.steps.find((step) => step.id === 'confirm')

    expect(confirm?.status).toBe('complete')
    expect(confirm?.artifacts).toContainEqual({ label: 'Program ID', value: PROGRAM_ID })
    expect(confirm?.artifacts).toContainEqual({ label: 'Owner', value: 'BPFLoaderUpgradeab1e11111111111111111111111' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Executable', value: 'true' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Program data', value: 'Data1111111111111111111111111111111111' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Upgrade authority', value: 'Auth1111111111111111111111111111111111' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Last deployed slot', value: '12345' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Data length', value: '4096 (0x1000) bytes' })
    expect(confirm?.artifacts).toContainEqual({ label: 'Balance', value: '1.234 SOL' })
    expect(updateRun).toHaveBeenCalledTimes(1)
  })
})
