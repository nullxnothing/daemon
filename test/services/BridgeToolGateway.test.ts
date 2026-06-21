import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaToolCallRecord } from '../../electron/shared/types'

// Fake catalog: one tool per risk tier, names matching the real allowlist so
// the allowlist ∩ catalog intersection is exercised. vi.hoisted so the vi.mock
// factories (hoisted above imports) can reference it.
const FAKE_TOOLS = vi.hoisted(() => [
  { name: 'read_wallet', description: 'Read wallets', kind: 'read', risk: 'read', input: { type: 'object', properties: {} } },
  { name: 'remember_fact', description: 'Store a fact', kind: 'edit', risk: 'write', input: { type: 'object', properties: { title: { type: 'string' } } } },
  { name: 'generate_wallet', description: 'New wallet', kind: 'run', risk: 'sensitive', input: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'tokenlaunch_preflight', description: 'Preflight', kind: 'read', risk: 'read', input: { type: 'object', properties: {} } },
])

vi.mock('../../electron/services/aria/toolCatalog', () => ({
  ARIA_TOOLS: FAKE_TOOLS,
  getTool: (name: string) => FAKE_TOOLS.find((t) => t.name === name),
}))

const executeToolCall = vi.hoisted(() => vi.fn())
vi.mock('../../electron/services/AriaAgentService', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
}))

const getEnabledPacks = vi.hoisted(() => vi.fn<() => Record<string, boolean>>(() => ({})))
vi.mock('../../electron/services/SettingsService', () => ({
  getEnabledPacks: () => getEnabledPacks(),
}))

const projectRows = vi.hoisted(() => [] as Array<{ id: string; path: string }>)
vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: () => ({ all: () => projectRows }),
  }),
}))

import {
  executeBridgeCall,
  findBridgeTool,
  listBridgeTools,
  resolveProjectForCwd,
  type BridgeGatewayDeps,
} from '../../electron/services/bridge/BridgeToolGateway'

function makeDeps(overrides: Partial<BridgeGatewayDeps> = {}): BridgeGatewayDeps {
  return {
    requestApproval: vi.fn(async () => true),
    cancelApproval: vi.fn(),
    emit: vi.fn(),
    approvalTimeoutMs: 50,
    ...overrides,
  }
}

function doneRecord(partial: Partial<AriaToolCallRecord> = {}): AriaToolCallRecord {
  return {
    callId: 'call-1', name: 'read_wallet', toolKind: 'read', risk: 'read',
    status: 'done', summary: 'ok', input: {}, ...partial,
  }
}

beforeEach(() => {
  executeToolCall.mockReset()
  getEnabledPacks.mockReturnValue({})
  projectRows.length = 0
})

describe('listBridgeTools / findBridgeTool', () => {
  it('exposes only allowlisted tools present in the catalog', () => {
    const names = listBridgeTools().map((t) => t.name)
    expect(names).toEqual(['read_wallet', 'generate_wallet', 'tokenlaunch_preflight', 'remember_fact'])
  })

  it('drops tools whose pack is disabled and explains on call', () => {
    getEnabledPacks.mockReturnValue({ wallet: false })
    const names = listBridgeTools().map((t) => t.name)
    expect(names).toEqual(['tokenlaunch_preflight', 'remember_fact'])

    const found = findBridgeTool('read_wallet')
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.error).toContain('wallet pack is disabled')
  })

  it('refuses tools outside the allowlist even if they exist in the catalog', () => {
    const found = findBridgeTool('present_plan')
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.error).toContain('not exposed over the DAEMON Bridge')
  })
})

describe('resolveProjectForCwd', () => {
  it('matches case-insensitively on win32 and prefers the longest prefix', () => {
    projectRows.push(
      { id: 'outer', path: 'C:\\Work' },
      { id: 'inner', path: 'C:\\Work\\daemon' },
    )
    expect(resolveProjectForCwd('c:\\work\\DAEMON\\src')?.id).toBe('inner')
    expect(resolveProjectForCwd('C:\\Work\\other')?.id).toBe('outer')
    expect(resolveProjectForCwd('D:\\elsewhere')).toBeNull()
    expect(resolveProjectForCwd(undefined)).toBeNull()
  })

  it('does not match sibling directories sharing a name prefix', () => {
    projectRows.push({ id: 'p', path: 'C:\\Work\\daemon' })
    expect(resolveProjectForCwd('C:\\Work\\daemon-other')).toBeNull()
  })
})

describe('executeBridgeCall', () => {
  it('requires a resolved project for project-scoped tools', async () => {
    const result = await executeBridgeCall(
      { toolName: 'remember_fact', input: { title: 'x' }, cwd: 'D:\\nowhere' },
      makeDeps(),
    )
    expect(result.status).toBe('error')
    expect(result.summary).toContain('No DAEMON project matches')
    expect(executeToolCall).not.toHaveBeenCalled()
  })

  it('runs through executeToolCall with a project-scoped snapshot', async () => {
    projectRows.push({ id: 'proj-1', path: 'C:\\Work\\daemon' })
    executeToolCall.mockResolvedValue(doneRecord({ summary: '2 wallets', result: { count: 2 } }))
    const deps = makeDeps()

    const result = await executeBridgeCall(
      { toolName: 'read_wallet', input: {}, cwd: 'C:\\Work\\daemon\\packages' },
      deps,
    )

    expect(result).toEqual({ status: 'done', summary: '2 wallets', result: { count: 2 } })
    const [, ctx] = executeToolCall.mock.calls[0] as [unknown, { sessionId: string; snapshot: { activeProjectId: string | null } }]
    expect(ctx.sessionId).toMatch(/^bridge:/)
    expect(ctx.snapshot.activeProjectId).toBe('proj-1')
    expect(deps.emit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', status: 'done' }))
  })

  it('maps a user rejection to status rejected', async () => {
    executeToolCall.mockImplementation(async (_use, _ctx, transport: { requestApproval: (r: unknown) => Promise<boolean> }) => {
      const approved = await transport.requestApproval({ callId: 'c1', name: 'remember_fact', risk: 'write', summary: 's', input: {} })
      return doneRecord(approved ? {} : { status: 'rejected', summary: 'User rejected this action.' })
    })
    const deps = makeDeps({ requestApproval: vi.fn(async () => false) })
    projectRows.push({ id: 'p', path: 'C:\\Work\\daemon' })

    const result = await executeBridgeCall({ toolName: 'remember_fact', input: { title: 'x' }, cwd: 'C:\\Work\\daemon' }, deps)
    expect(result.status).toBe('rejected')
  })

  it('auto-rejects as timeout when no one answers the approval', async () => {
    executeToolCall.mockImplementation(async (_use, _ctx, transport: { requestApproval: (r: unknown) => Promise<boolean> }) => {
      const approved = await transport.requestApproval({ callId: 'c2', name: 'generate_wallet', risk: 'sensitive', summary: 's', input: {} })
      return doneRecord(approved ? {} : { status: 'rejected', summary: 'User rejected this action.' })
    })
    const deps = makeDeps({
      requestApproval: vi.fn(() => new Promise<boolean>(() => {})), // never answered
      approvalTimeoutMs: 30,
    })

    const result = await executeBridgeCall({ toolName: 'generate_wallet', input: { name: 'w' } }, deps)
    expect(result.status).toBe('timeout')
    expect(result.summary).toContain('Approval timed out')
    expect(deps.cancelApproval).toHaveBeenCalledWith('c2')
  })

  it('hands tools a runUiEffect that throws (bridge tripwire)', async () => {
    executeToolCall.mockImplementation(async (_use, ctx: { runUiEffect: (e: unknown, a: boolean) => Promise<unknown> }) => {
      await expect(ctx.runUiEffect({ type: 'open_tool', toolId: 'x' }, false)).rejects.toThrow('not available over the bridge')
      return doneRecord()
    })

    const result = await executeBridgeCall({ toolName: 'read_wallet', input: {} }, makeDeps())
    expect(result.status).toBe('done')
  })

  it('rejects non-object input before reaching the executor', async () => {
    const result = await executeBridgeCall(
      { toolName: 'read_wallet', input: [1, 2] as unknown as Record<string, unknown> },
      makeDeps(),
    )
    expect(result.status).toBe('error')
    expect(result.summary).toContain('JSON object')
    expect(executeToolCall).not.toHaveBeenCalled()
  })
})
